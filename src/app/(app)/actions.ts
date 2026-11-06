"use server";

import { refresh } from "next/cache";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { fulfillOrder, getInventory, registerWebhooks, setStock, updateShopifyNote } from "@/lib/shopify/actions";
import { INITIAL_STOCK, OLD_REPORT_AT, UPCOMING_ROWS } from "@/data/initial-stock";
import {
  catchUpOrders,
  deleteItem,
  receiveUpcoming,
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
    // Depodan "PR" ile düşüp notta @kullanıcı yazılırsa PR takibine de eklenir
    const handle = input.reason === "pr" && input.delta && input.delta < 0 ? input.note?.match(/@([A-Za-z0-9._]{1,30})/)?.[1] : null;
    if (handle) {
      const { recordSendFromDepo } = await import("@/lib/pr");
      await recordSendFromDepo(handle, input.itemId, -input.delta!, input.note ?? null).catch(() => null);
    }
    refresh();
    return { ok: true, message: `Kaydedildi · elde ${u.qty}${handle ? ` · PR'a eklendi (@${handle.toLowerCase()})` : ""}` };
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
    const r = await importRows([...INITIAL_STOCK, ...UPCOMING_ROWS], "replace", {
      startedAt: OLD_REPORT_AT,
      note: "Başlangıç stoğu",
    });
    const applied = await catchUpOrders();
    refresh();
    const units = INITIAL_STOCK.reduce((s, x) => s + x.qty, 0);
    return {
      ok: true,
      message: `${r.created - UPCOMING_ROWS.length} ürün-beden, ${units} adet yüklendi · ${UPCOMING_ROWS.length} ürün stok bekliyor${applied ? ` · rapordan sonraki ${applied} sipariş düşüldü` : ""}`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function depoReceiveAction(itemId: number, sizes: { variant: string; qty: number }[]): Promise<ActionResult> {
  await requireSession();
  try {
    const clean = sizes.filter((x) => Number.isInteger(x.qty) && x.qty > 0);
    if (!clean.length) return { ok: false, message: "En az bir bedene adet gir" };
    await receiveUpcoming(itemId, clean);
    refresh();
    return { ok: true, message: `${clean.reduce((s, x) => s + x.qty, 0)} adet depoya girdi` };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectInstagramAction(): Promise<ActionResult> {
  await requireSession();
  const { disconnectInstagram } = await import("@/lib/instagram");
  await disconnectInstagram();
  refresh();
  return { ok: true, message: "Instagram bağlantısı kesildi" };
}

// ---------------------------------------------------------------------------
// Drop'lar

/** datetime-local değerini İstanbul saati olarak yorumla */
function istanbulDate(v: string) {
  if (!v) return null;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v.length === 10 ? `${v}T00:00` : v}:00+03:00`);
  return Number.isNaN(+d) ? null : d;
}

export async function addDropAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    const name = String(form.get("name") ?? "").trim();
    const teaserAt = istanbulDate(String(form.get("teaserAt") ?? ""));
    const launchAt = istanbulDate(String(form.get("launchAt") ?? ""));
    if (!name || !teaserAt || !launchAt) return { ok: false, message: "İsim, teaser ve lansman tarihi gerekli" };
    if (teaserAt > launchAt) return { ok: false, message: "Teaser lansmandan önce olmalı" };
    const { addDrop } = await import("@/lib/ig-store");
    await addDrop({ name, teaserAt, launchAt, note: String(form.get("note") ?? "").trim() || null });
    refresh();
    return { ok: true, message: "Drop eklendi" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDropAction(id: number): Promise<ActionResult> {
  await requireSession();
  const { deleteDrop } = await import("@/lib/ig-store");
  await deleteDrop(id);
  refresh();
  return { ok: true, message: "Silindi" };
}

export async function snapshotStoriesAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const { snapshotStories } = await import("@/lib/ig-store");
    const n = await snapshotStories();
    refresh();
    return { ok: true, message: typeof n === "number" ? `${n} aktif story kaydedildi` : String(n) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// PR

export async function prCreateSendAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    const { createSend } = await import("@/lib/pr");
    const items = JSON.parse(String(form.get("items") ?? "[]")) as { itemId: number; qty: number }[];
    const handle = String(form.get("handle") ?? "");
    if (!handle.trim()) return { ok: false, message: "Instagram kullanıcı adı gerekli" };
    if (!items.some((i) => i.qty > 0)) return { ok: false, message: "En az bir ürün seç" };
    const date = String(form.get("sentAt") ?? "");
    const send = await createSend({
      handle,
      name: String(form.get("name") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
      code: String(form.get("code") ?? "").trim() || null,
      category: String(form.get("category") ?? "").trim() || null,
      note: String(form.get("note") ?? "").trim() || null,
      items,
      sentAt: date ? new Date(`${date}T12:00:00+03:00`) : undefined,
    });
    refresh();
    return { ok: true, message: `Kaydedildi, stoktan düşüldü (#${send.id})` };
  } catch (e) {
    return fail(e);
  }
}

export async function prScanAction(): Promise<ActionResult> {
  await requireSession();
  try {
    const { scanAllPr } = await import("@/lib/pr");
    const r = await scanAllPr({ force: true });
    refresh();
    return typeof r === "string"
      ? { ok: false, message: `Instagram ${r}` }
      : { ok: true, message: `${r.people} kişi tarandı · ${r.found} paylaşım eşleşti` };
  } catch (e) {
    return fail(e);
  }
}

export async function prDeleteSendAction(id: number, restock: boolean): Promise<ActionResult> {
  await requireSession();
  const { deleteSend } = await import("@/lib/pr");
  await deleteSend(id, restock);
  refresh();
  return { ok: true, message: restock ? "Silindi, ürünler stoğa geri eklendi" : "Silindi" };
}

export async function prStatusAction(id: number, status: "waiting" | "posted" | "no_post"): Promise<ActionResult> {
  await requireSession();
  const { setSendStatus } = await import("@/lib/pr");
  await setSendStatus(id, status);
  refresh();
  return { ok: true };
}

export async function prAddLinkAction(sendId: number, url: string): Promise<ActionResult> {
  await requireSession();
  try {
    const { addManualPost } = await import("@/lib/pr");
    await addManualPost(sendId, url);
    refresh();
    return { ok: true, message: "Paylaşım eklendi" };
  } catch (e) {
    return fail(e);
  }
}

export async function prUpdatePersonAction(
  id: number,
  patch: { name?: string | null; phone?: string | null; code?: string | null; category?: string | null; note?: string | null },
): Promise<ActionResult> {
  await requireSession();
  const { updatePerson } = await import("@/lib/pr");
  await updatePerson(id, patch);
  refresh();
  return { ok: true, message: "Kaydedildi" };
}

// ---------------------------------------------------------------------------
// Notlar

export async function noteCreateAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    const { createNote } = await import("@/lib/notes");
    const title = String(form.get("title") ?? "").trim();
    const items = String(form.get("items") ?? "")
      .split("\n")
      .map((s) => s.replace(/^[-*•\s]+/, "").trim())
      .filter(Boolean);
    if (!title && !items.length) return { ok: false, message: "Başlık ya da madde yaz" };
    await createNote({ title: title || items[0], body: String(form.get("body") ?? ""), items, by: String(form.get("by") ?? "") });
    refresh();
    return { ok: true, message: "Not eklendi" };
  } catch (e) {
    return fail(e);
  }
}

export async function noteToggleAction(noteId: number, itemId: string, done: boolean, by: string | null): Promise<ActionResult> {
  await requireSession();
  const { toggleItem } = await import("@/lib/notes");
  await toggleItem(noteId, itemId, done, by);
  refresh();
  return { ok: true };
}

export async function noteAddItemAction(noteId: number, text: string): Promise<ActionResult> {
  await requireSession();
  const { addItem } = await import("@/lib/notes");
  await addItem(noteId, text);
  refresh();
  return { ok: true };
}

export async function noteRemoveItemAction(noteId: number, itemId: string): Promise<ActionResult> {
  await requireSession();
  const { removeItem } = await import("@/lib/notes");
  await removeItem(noteId, itemId);
  refresh();
  return { ok: true };
}

export async function noteEditItemAction(noteId: number, itemId: string, text: string): Promise<ActionResult> {
  await requireSession();
  const { editItem } = await import("@/lib/notes");
  await editItem(noteId, itemId, text);
  refresh();
  return { ok: true };
}

export async function noteUpdateAction(
  id: number,
  patch: { title?: string; body?: string | null; pinned?: boolean; archived?: boolean },
): Promise<ActionResult> {
  await requireSession();
  const { updateNote } = await import("@/lib/notes");
  await updateNote(id, patch);
  refresh();
  return { ok: true };
}

export async function noteDeleteAction(id: number): Promise<ActionResult> {
  await requireSession();
  const { deleteNote } = await import("@/lib/notes");
  await deleteNote(id);
  refresh();
  return { ok: true, message: "Silindi" };
}
