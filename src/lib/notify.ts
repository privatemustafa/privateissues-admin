import "server-only";
import { and, count, eq, gte, inArray, lt, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LineItem, NewOrder } from "@/db/schema";
import { sendPush, type PushPayload } from "./push";
import { getSettings } from "./settings";
import {
  ago,
  waitedFor,
  dayKey,
  firstName,
  hoursSince,
  isExpress,
  istanbulHour,
  money,
  startOfTodayIstanbul,
} from "./format";

const APP = () => (process.env.APP_URL || "").replace(/\/$/, "");

/** kind+ref daha önce gönderildiyse tekrar göndermez. */
export async function once(kind: string, ref: string, payload: PushPayload) {
  const inserted = await db()
    .insert(schema.notificationLog)
    .values({ kind, ref, title: payload.title, body: payload.body, url: payload.url })
    .onConflictDoNothing()
    .returning({ id: schema.notificationLog.id });
  if (!inserted.length) return false;
  await sendPush({ ...payload, kind });
  return true;
}

async function markSent(kind: string, ref: string) {
  await db().insert(schema.notificationLog).values({ kind, ref }).onConflictDoNothing();
}

async function pendingCount() {
  const [r] = await db()
    .select({ n: count() })
    .from(schema.orders)
    .where(eq(schema.orders.needsShipping, true));
  return r?.n ?? 0;
}

function isQuiet(quietNights: boolean) {
  const h = istanbulHour();
  return quietNights && h < 8;
}

function itemLine(items: LineItem[]) {
  if (!items.length) return "";
  const [a] = items;
  const v = a.variantTitle ? ` (${a.variantTitle})` : "";
  const qty = a.quantity > 1 ? ` ×${a.quantity}` : "";
  const more = items.length > 1 ? `  +${items.length - 1} ürün` : "";
  return `${a.title}${v}${qty}${more}`;
}

const ordinal = (n: number) => `${n}.`;

// ---------------------------------------------------------------------------

export async function notifyNewOrder(o: NewOrder) {
  if (o.test) return;
  const settings = await getSettings();

  const [today] = await db()
    .select({ n: count(), total: sum(schema.orders.total) })
    .from(schema.orders)
    .where(and(gte(schema.orders.createdAt, startOfTodayIstanbul()), eq(schema.orders.test, false)));

  const items = (o.lineItems ?? []) as LineItem[];
  const city = o.shippingAddress?.city;
  const who = [firstName(o.customerName), city].filter(Boolean).join(", ");
  const loyalty =
    o.customerOrderCount && o.customerOrderCount > 1
      ? `${ordinal(o.customerOrderCount)} siparişi`
      : "ilk siparişi";
  const express = isExpress(o.shippingMethod) ? " · Hızlı kargo" : "";
  const nToday = today?.n ?? 1;
  const totalToday = Number(today?.total ?? o.total);

  const body = [
    itemLine(items),
    `${who} · ${loyalty}${express}`,
    nToday > 1 ? `Bugün ${nToday} sipariş · ${money(totalToday)}` : "Bugünün ilk siparişi",
  ]
    .filter(Boolean)
    .join("\n");

  await once("new", o.id, {
    title: `${o.name} · ${money(o.total, o.currency)}`,
    body,
    url: `${APP()}/orders/${encodeURIComponent(o.id)}`,
    shipUrl: `${APP()}/orders/${encodeURIComponent(o.id)}?ship=1`,
    image: items.find((i) => i.image)?.image ?? null,
    tag: o.id,
    renotify: true,
    silent: isQuiet(settings.quietNights),
    actions: [
      { action: "ship", title: "Kargola" },
      { action: "open", title: "Siparişi aç" },
    ],
    badgeCount: await pendingCount(),
  });

  await checkLowStock(items, settings.lowStock);
}

export async function notifyCancelled(o: NewOrder) {
  await once("cancelled", o.id, {
    title: `${o.name} iptal edildi`,
    body: `${firstName(o.customerName)} · ${money(o.total, o.currency)}\n${itemLine((o.lineItems ?? []) as LineItem[])}`,
    url: `${APP()}/orders/${encodeURIComponent(o.id)}`,
    tag: o.id,
    renotify: true,
    badgeCount: await pendingCount(),
  });
}

export async function checkLowStock(items: LineItem[], threshold: number) {
  for (const it of items) {
    if (!it.variantId || it.inventoryQuantity == null) continue;
    const q = it.inventoryQuantity;
    if (q > threshold) {
      await resetStockAlert(it.variantId);
      continue;
    }
    const name = `${it.title}${it.variantTitle ? ` · ${it.variantTitle}` : ""}`;
    if (q <= 0) {
      await once("stock-out", it.variantId, {
        title: `Tükendi: ${name}`,
        body: "Bu beden artık satışta görünmüyor olabilir. Stoğu kontrol et.",
        url: `${APP()}/stock`,
        image: it.image,
        tag: `stock-${it.variantId}`,
      });
    } else {
      await once("stock-low", it.variantId, {
        title: `Stok azaldı: ${name}`,
        body: `Sadece ${q} adet kaldı.`,
        url: `${APP()}/stock`,
        image: it.image,
        tag: `stock-${it.variantId}`,
      });
    }
  }
}

/** Stok tekrar yükselince bir sonraki düşüşte yine haber verebilmek için log'u temizler. */
export async function resetStockAlert(variantId: string) {
  await db()
    .delete(schema.notificationLog)
    .where(
      and(
        eq(schema.notificationLog.ref, variantId),
        inArray(schema.notificationLog.kind, ["stock-low", "stock-out"]),
      ),
    );
}

// ---------------------------------------------------------------------------
// Zamanlanmış kontroller (cron her 15 dk'da bir çağırır)

export async function runOverdueChecks() {
  const settings = await getSettings();
  if (isQuiet(settings.quietNights)) return { overdue: 0 };

  const pending = await db().select().from(schema.orders).where(eq(schema.orders.needsShipping, true));
  const thresholds = [...settings.overdueHours].sort((a, b) => a - b);
  const now = Date.now();

  type Hit = { o: (typeof pending)[number]; th: number };
  const hits: Hit[] = [];

  for (const o of pending) {
    const h = hoursSince(o.createdAt, now) * (isExpress(o.shippingMethod) ? 2 : 1);
    const crossed = thresholds.filter((t) => h >= t);
    if (!crossed.length) continue;
    const top = crossed[crossed.length - 1];
    const already = await db()
      .select({ id: schema.notificationLog.id })
      .from(schema.notificationLog)
      .where(and(eq(schema.notificationLog.kind, `overdue-${top}`), eq(schema.notificationLog.ref, o.id)))
      .limit(1);
    if (already.length) continue;
    // alt eşikleri "gönderildi" say → aynı sipariş için geriye dönük spam olmasın
    for (const t of crossed.slice(0, -1)) await markSent(`overdue-${t}`, o.id);
    hits.push({ o, th: top });
  }

  if (!hits.length) return { overdue: 0 };
  const badgeCount = pending.length;

  if (hits.length > 2) {
    for (const { o, th } of hits) await markSent(`overdue-${th}`, o.id);
    const oldest = hits.reduce((a, b) => (a.o.createdAt < b.o.createdAt ? a : b)).o;
    await once("overdue-group", new Date().toISOString(), {
      title: `${hits.length} paket kargo bekliyor`,
      body: `En eskisi ${oldest.name}, ${waitedFor(oldest.createdAt)} bekliyor.\nBugün çıkar, müşteri beklemesin.`,
      url: `${APP()}/orders?status=open`,
      tag: "overdue-group",
      renotify: true,
      requireInteraction: true,
      badgeCount,
    });
    return { overdue: hits.length };
  }

  for (const { o, th } of hits) {
    const items = (o.lineItems ?? []) as LineItem[];
    const late = th >= thresholds[thresholds.length - 1];
    await once(`overdue-${th}`, o.id, {
      title: late ? `Gecikiyor: ${o.name}` : `${o.name} hâlâ kargoda değil`,
      body: [
        `${firstName(o.customerName)} ${waitedFor(o.createdAt)} bekliyor${isExpress(o.shippingMethod) ? " · Hızlı kargo seçmişti" : ""}`,
        itemLine(items),
      ].join("\n"),
      url: `${APP()}/orders/${encodeURIComponent(o.id)}`,
      shipUrl: `${APP()}/orders/${encodeURIComponent(o.id)}?ship=1`,
      image: items.find((i) => i.image)?.image ?? null,
      tag: o.id,
      renotify: true,
      requireInteraction: th >= 48,
      actions: [
        { action: "ship", title: "Kargola" },
        { action: "open", title: "Aç" },
      ],
      badgeCount,
    });
  }
  return { overdue: hits.length };
}

export async function runDailyDigests() {
  const settings = await getSettings();
  const hour = istanbulHour();
  const today = dayKey(new Date());
  const startToday = startOfTodayIstanbul();
  const startYesterday = new Date(+startToday - 24 * 3_600_000);

  const pending = await db()
    .select({ createdAt: schema.orders.createdAt })
    .from(schema.orders)
    .where(eq(schema.orders.needsShipping, true));
  const oldest = pending.reduce<Date | null>((a, p) => (!a || p.createdAt < a ? p.createdAt : a), null);

  if (settings.morningDigest && hour >= 9 && hour < 12) {
    const [y] = await db()
      .select({ n: count(), total: sum(schema.orders.total) })
      .from(schema.orders)
      .where(
        and(
          gte(schema.orders.createdAt, startYesterday),
          lt(schema.orders.createdAt, startToday),
          eq(schema.orders.test, false),
        ),
      );
    const n = y?.n ?? 0;
    const line1 = n ? `Dün ${n} sipariş · ${money(Number(y?.total ?? 0))}` : "Dün sipariş gelmedi.";
    const line2 = pending.length
      ? `${pending.length} paket hazırlanmayı bekliyor${oldest ? ` (en eskisi ${ago(oldest)})` : ""}`
      : "Bekleyen paket yok, her şey yolda.";
    await once("digest-morning", today, {
      title: "Günaydın — Private Issues",
      body: `${line1}\n${line2}`,
      url: `${APP()}/`,
      tag: "digest",
      badgeCount: pending.length,
    });
  }

  if (settings.eveningReminder && hour >= 16 && hour < 19 && pending.length) {
    await once("digest-evening", today, {
      title: "Kargo kapanmadan",
      body: `${pending.length} paket bugün çıkabilir.${oldest ? ` En eskisi ${waitedFor(oldest)} bekliyor.` : ""}`,
      url: `${APP()}/orders?status=open`,
      tag: "evening",
      requireInteraction: true,
      badgeCount: pending.length,
    });
  }
}
