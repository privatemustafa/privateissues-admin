"use server";

import { refresh } from "next/cache";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fulfillOrder, getInventory, registerWebhooks, setStock, updateShopifyNote } from "@/lib/shopify/actions";
import { INITIAL_STOCK, OLD_REPORT_AT } from "@/data/initial-stock";
import {
  catchUpOrders,
  deleteItem,
  dismissUnmatched,
  importRows,
  linkUnmatched,
  moveStock,
  updateItem,
  type ImportRow,
} from "@/lib/warehouse";
import type { MoveReason } from "@/db/schema";

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
      warehouseAutoDeduct: form.get("warehouseAutoDeduct") === "on",
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

// ---------------------------------------------------------------------------
// Depo


export async function depoMoveAction(input: {
  itemId: number;
  reason: MoveReason;
  delta?: number;
  setTo?: number;
  note?: string;
}): Promise<ActionResult> {
  await requireSession();
  try {
    if (input.setTo != null && (!Number.isInteger(input.setTo) || input.setTo < 0)) return { ok: false, message: "Geçersiz adet" };
    if (input.delta != null && !Number.isInteger(input.delta)) return { ok: false, message: "Geçersiz adet" };
    const u = await moveStock(input);
    refresh();
    return { ok: true, message: `Kaydedildi · elde ${u.qty}` };
  } catch (e) {
    return fail(e);
  }
}

export async function depoUpdateAction(
  id: number,
  patch: { location?: string | null; minQty?: number | null; cost?: number | null; sku?: string | null },
): Promise<ActionResult> {
  await requireSession();
  try {
    await updateItem(id, patch);
    refresh();
    return { ok: true, message: "Kaydedildi" };
  } catch (e) {
    return fail(e);
  }
}

export async function depoDeleteAction(id: number): Promise<ActionResult> {
  await requireSession();
  await deleteItem(id);
  refresh();
  return { ok: true, message: "Silindi" };
}

export async function depoLinkAction(moveId: number, itemId: number): Promise<ActionResult> {
  await requireSession();
  try {
    await linkUnmatched(moveId, itemId);
    refresh();
    return { ok: true, message: "Eşleştirildi ve düşüldü" };
  } catch (e) {
    return fail(e);
  }
}

export async function depoDismissAction(moveId: number): Promise<ActionResult> {
  await requireSession();
  await dismissUnmatched(moveId);
  refresh();
  return { ok: true };
}

export async function depoImportAction(rows: ImportRow[], mode: "merge" | "replace"): Promise<ActionResult> {
  await requireSession();
  try {
    const clean = rows
      .filter((r) => r.product?.trim() && Number.isFinite(r.qty))
      .map((r) => ({ ...r, qty: Math.round(r.qty) }));
    if (!clean.length) return { ok: false, message: "Aktarılacak satır yok" };
    const r = await importRows(clean, mode);
    refresh();
    return { ok: true, message: `${r.created} yeni, ${r.updated} güncellendi` };
  } catch (e) {
    return fail(e);
  }
}

/** Depoyu Shopify'daki mevcut stokla başlatır (ürün, beden, adet, fotoğraf, eşleşme hazır gelir). */
export async function depoSeedFromShopifyAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const products = await getInventory();
    const rows: ImportRow[] = products.flatMap((p) =>
      p.variants.map((v) => ({
        product: p.title,
        variant: v.title === "Tek beden" ? null : v.title,
        qty: Math.max(0, v.qty),
        image: p.image,
        shopifyVariantId: v.id,
      })),
    );
    const r = await importRows(rows, "merge");
    refresh();
    return { ok: true, message: `${r.created} beden eklendi, ${r.updated} güncellendi` };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Mustafa'nın verdiği başlangıç stoğunu yükler (eski koleksiyon raporu + yeni koleksiyon).
 * Depo 19 Ağu raporundan başlar; o tarihten sonraki Shopify siparişleri otomatik düşülür.
 */
export async function depoLoadInitialAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const r = await importRows(INITIAL_STOCK, "replace", {
      startedAt: OLD_REPORT_AT,
      note: "Başlangıç stoğu",
    });
    const applied = await catchUpOrders();
    refresh();
    const units = INITIAL_STOCK.reduce((s, x) => s + x.qty, 0);
    return {
      ok: true,
      message: `${r.created} ürün-beden, ${units} adet yüklendi${applied ? ` · rapordan sonraki ${applied} sipariş düşüldü` : ""}`,
    };
  } catch (e) {
    return fail(e);
  }
}
