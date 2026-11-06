"use server";

import { refresh } from "next/cache";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fulfillOrder, registerWebhooks, setStock, updateShopifyNote } from "@/lib/shopify/actions";
import { syncOrders } from "@/lib/shopify/sync";
import { sendPush } from "@/lib/push";
import { saveSettings, type Settings } from "@/lib/settings";
import { money } from "@/lib/format";

export type ActionResult = { ok: boolean; message?: string };

function fail(e: unknown): ActionResult {
  console.error(e);
  return { ok: false, message: e instanceof Error ? e.message : "Bir şeyler ters gitti" };
}

export async function fulfillAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    const orderId = String(form.get("orderId"));
    const order = await fulfillOrder({
      orderId,
      company: String(form.get("company") ?? "") || undefined,
      trackingNumber: String(form.get("tracking") ?? "").trim() || undefined,
      notifyCustomer: form.get("notify") === "on",
    });
    refresh();
    return { ok: true, message: order ? `${order.name} kargolandı` : "Kargolandı" };
  } catch (e) {
    return fail(e);
  }
}

export async function saveNoteAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    const orderId = String(form.get("orderId"));
    const note = String(form.get("note") ?? "");
    const target = String(form.get("target") ?? "internal");
    if (target === "shopify") {
      await updateShopifyNote(orderId, note);
    } else {
      await db()
        .insert(schema.orderNotes)
        .values({ orderId, note, updatedAt: new Date() })
        .onConflictDoUpdate({ target: schema.orderNotes.orderId, set: { note, updatedAt: new Date() } });
    }
    refresh();
    return { ok: true, message: "Kaydedildi" };
  } catch (e) {
    return fail(e);
  }
}

export async function syncNowAction(full: boolean): Promise<ActionResult> {
  await requireSession();
  try {
    const r = await syncOrders({ full });
    refresh();
    return { ok: true, message: `${r.count} sipariş güncellendi` };
  } catch (e) {
    return fail(e);
  }
}

export async function registerWebhooksAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const appUrl = process.env.APP_URL;
    if (!appUrl || appUrl.includes("localhost")) {
      return { ok: false, message: "APP_URL canlı adres olmalı (örn. https://admin.privateissues.com)" };
    }
    const r = await registerWebhooks(appUrl);
    refresh();
    return { ok: true, message: r.length ? r.join(" · ") : "Webhook'lar zaten kurulu" };
  } catch (e) {
    return fail(e);
  }
}

export async function testPushAction(): Promise<ActionResult> {
  await requireSession();
  const r = await sendPush({
    kind: "test",
    title: "#1000 · " + money(2586),
    body: "KNIGHT ZIP-UP (M)\nTest M., İstanbul · ilk siparişi · Hızlı kargo\nBildirimler çalışıyor.",
    url: "/",
    image: "/icons/icon-512.png",
    tag: "test",
    renotify: true,
    actions: [
      { action: "open", title: "Aç" },
      { action: "ship", title: "Kargola" },
    ],
  });
  return r.sent
    ? { ok: true, message: `${r.sent} cihaza gönderildi` }
    : { ok: false, message: "reason" in r ? String(r.reason) : "Kayıtlı cihaz yok — önce bildirimleri aç" };
}

export async function saveSettingsAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    const hours = String(form.get("overdueHours") ?? "")
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    const patch: Partial<Settings> = {
      overdueHours: hours.length ? hours : [24, 48, 72],
      lowStock: Math.max(0, Number(form.get("lowStock") ?? 3) || 0),
      morningDigest: form.get("morningDigest") === "on",
      eveningReminder: form.get("eveningReminder") === "on",
      quietNights: form.get("quietNights") === "on",
    };
    await saveSettings(patch);
    refresh();
    return { ok: true, message: "Ayarlar kaydedildi" };
  } catch (e) {
    return fail(e);
  }
}

export async function setStockAction(input: {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  from: number | null;
}): Promise<ActionResult> {
  await requireSession();
  try {
    if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 100000) {
      return { ok: false, message: "Geçersiz adet" };
    }
    await setStock(input);
    return { ok: true, message: "Stok güncellendi" };
  } catch (e) {
    return fail(e);
  }
}
