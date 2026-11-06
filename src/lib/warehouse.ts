import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema, kvGet, kvSet } from "@/db";
import type { LineItem, MoveReason, NewOrder, Order, WarehouseItem } from "@/db/schema";
import { getSettings } from "./settings";
import { once } from "./notify";

const W = schema.warehouseItems;
const M = schema.stockMoves;

// ---------------------------------------------------------------------------
// Yardımcılar

/** Türkçe karakter + boşluk + noktalama farklarını yok sayan karşılaştırma anahtarı */
export function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function itemKey(product: string, variant?: string | null, color?: string | null) {
  return [norm(product), norm(variant), norm(color)].join("|");
}

export function itemLabel(i: Pick<WarehouseItem, "product" | "variant" | "color">) {
  return [i.product, i.color, i.variant].filter(Boolean).join(" · ");
}

function findMatch(all: WarehouseItem[], li: LineItem) {
  const items = all.filter((i) => !i.upcoming);
  if (li.variantId) {
    const byId = items.find((i) => i.shopifyVariantId === li.variantId);
    if (byId) return byId;
  }
  const p = norm(li.title);
  const v = norm(li.variantTitle);
  // Shopify varyant adı "Siyah / M" gibi olabilir → renk+beden birleşik de dene
  return (
    items.find((i) => norm(i.product) === p && norm(i.variant) === v && !i.color) ??
    items.find((i) => norm(i.product) === p && (norm(`${i.color ?? ""}${i.variant ?? ""}`) === v || norm(`${i.variant ?? ""}${i.color ?? ""}`) === v)) ??
    items.find((i) => norm(i.product) === p && norm(i.variant) === v)
  );
}

export async function warehouseStartedAt() {
  return kvGet<string>("warehouse_started_at");
}

async function ensureStarted() {
  if (!(await warehouseStartedAt())) await kvSet("warehouse_started_at", new Date().toISOString());
}

async function lowAlert(item: WarehouseItem, qty: number) {
  if (item.upcoming) return;
  const settings = await getSettings();
  const min = item.minQty ?? settings.lowStock;
  const ref = `wh-${item.id}`;
  if (qty > min) {
    await db()
      .delete(schema.notificationLog)
      .where(and(eq(schema.notificationLog.ref, ref), inArray(schema.notificationLog.kind, ["wh-low", "wh-out"])));
    return;
  }
  const app = (process.env.APP_URL || "").replace(/\/$/, "");
  await once(qty <= 0 ? "wh-out" : "wh-low", ref, {
    title: qty <= 0 ? `Depoda bitti: ${itemLabel(item)}` : `Depoda azaldı: ${itemLabel(item)}`,
    body: qty <= 0 ? "Bu bedenden elde kalmadı." : `Elde ${qty} adet kaldı${item.location ? ` · ${item.location}` : ""}.`,
    url: `${app}/depo?q=${encodeURIComponent(item.product)}`,
    image: item.image,
    tag: ref,
  });
}

// ---------------------------------------------------------------------------
// Siparişten düşme / iptalde geri ekleme

type OrderLike = Pick<NewOrder, "id" | "name" | "createdAt" | "cancelledAt" | "test" | "lineItems">;

/**
 * Sipariş satırlarını depodan düşer. Aynı sipariş kaç kez gelirse gelsin bir kez işlenir.
 * İptal edilmişse önceden düşülenleri geri ekler.
 */
export async function applyOrdersToWarehouse(orders: OrderLike[]) {
  const started = await warehouseStartedAt();
  if (!started || !orders.length) return;
  const settings = await getSettings();
  if (!settings.warehouseAutoDeduct) return;

  const items = await db().select().from(W);
  for (const o of orders) {
    if (o.test || +new Date(o.createdAt as Date) < +new Date(started)) continue;
    if (o.cancelledAt) await revertOrder(o.id, new Date(o.cancelledAt as Date));
    else await deductOrder(o, items);
  }
}

async function deductOrder(o: OrderLike, items: WarehouseItem[]) {
  const lines = (o.lineItems ?? []) as LineItem[];
  for (const [i, li] of lines.entries()) {
    const match = findMatch(items, li);
    const meta = { title: li.title, variant: li.variantTitle, quantity: li.quantity, variantId: li.variantId, image: li.image };
    const after = await db().transaction(async (tx) => {
      const ins = await tx
        .insert(M)
        .values({
          dedupe: `order:${o.id}:${i}`,
          itemId: match?.id ?? null,
          delta: match ? -li.quantity : 0,
          reason: match ? "order" : "unmatched",
          ref: o.id,
          refName: o.name,
          meta,
          // geriye dönük düşmelerde hareket, siparişin kendi tarihiyle görünsün
          createdAt: new Date(o.createdAt as Date),
        })
        .onConflictDoNothing()
        .returning({ id: M.id });
      if (!ins.length || !match) return null;
      const [u] = await tx
        .update(W)
        .set({
          qty: sql`${W.qty} - ${li.quantity}`,
          updatedAt: new Date(),
          shopifyVariantId: match.shopifyVariantId ?? li.variantId,
          image: match.image ?? li.image,
        })
        .where(eq(W.id, match.id))
        .returning();
      await tx.update(M).set({ qtyAfter: u.qty }).where(eq(M.id, ins[0].id));
      return u;
    });
    if (after) {
      const idx = items.findIndex((x) => x.id === after.id);
      if (idx >= 0) items[idx] = after;
      await lowAlert(after, after.qty);
    }
  }
}

export async function revertOrder(orderId: string, at = new Date()) {
  const moves = await db()
    .select()
    .from(M)
    .where(and(eq(M.ref, orderId), inArray(M.reason, ["order", "unmatched"])));
  for (const mv of moves) {
    if (mv.reason === "unmatched") {
      await db().delete(M).where(eq(M.id, mv.id));
      continue;
    }
    if (!mv.itemId || !mv.delta) continue;
    await db().transaction(async (tx) => {
      const ins = await tx
        .insert(M)
        .values({ dedupe: `cancel:${mv.id}`, itemId: mv.itemId, delta: -mv.delta, reason: "cancel", ref: orderId, refName: mv.refName, createdAt: at })
        .onConflictDoNothing()
        .returning({ id: M.id });
      if (!ins.length) return;
      const [u] = await tx
        .update(W)
        .set({ qty: sql`${W.qty} + ${-mv.delta}`, updatedAt: new Date() })
        .where(eq(W.id, mv.itemId!))
        .returning({ qty: W.qty });
      await tx.update(M).set({ qtyAfter: u.qty }).where(eq(M.id, ins[0].id));
    });
  }
}

/** Eşleşmeyen sipariş satırını bir depo ürününe bağlar (ve düşer). Bir dahakine otomatik eşleşir. */
export async function linkUnmatched(moveId: number, itemId: number) {
  await db().transaction(async (tx) => {
    const [mv] = await tx.select().from(M).where(and(eq(M.id, moveId), eq(M.reason, "unmatched")));
    if (!mv) return;
    const q = mv.meta?.quantity ?? 1;
    const [u] = await tx
      .update(W)
      .set({
        qty: sql`${W.qty} - ${q}`,
        updatedAt: new Date(),
        ...(mv.meta?.variantId ? { shopifyVariantId: mv.meta.variantId } : {}),
      })
      .where(eq(W.id, itemId))
      .returning();
    await tx.update(M).set({ itemId, delta: -q, reason: "order", qtyAfter: u.qty }).where(eq(M.id, moveId));
    if (mv.meta?.image && !u.image) await tx.update(W).set({ image: mv.meta.image }).where(eq(W.id, itemId));
  });
}

export async function dismissUnmatched(moveId: number) {
  await db().delete(M).where(and(eq(M.id, moveId), eq(M.reason, "unmatched")));
}

// ---------------------------------------------------------------------------
// Elle hareketler

export async function moveStock(input: {
  itemId: number;
  reason: MoveReason;
  delta?: number;
  setTo?: number;
  note?: string;
  ref?: string;
  refName?: string;
}) {
  const out = await db().transaction(async (tx) => {
    const [item] = await tx.select().from(W).where(eq(W.id, input.itemId)).for("update");
    if (!item) throw new Error("Ürün bulunamadı");
    const delta = input.setTo != null ? input.setTo - item.qty : (input.delta ?? 0);
    if (!delta) return item;
    const [u] = await tx
      .update(W)
      .set({ qty: item.qty + delta, upcoming: false, updatedAt: new Date() })
      .where(eq(W.id, item.id))
      .returning();
    await tx.insert(M).values({
      itemId: item.id,
      delta,
      qtyAfter: u.qty,
      reason: input.reason,
      note: input.note || null,
      ref: input.ref ?? null,
      refName: input.refName ?? null,
    });
    return u;
  });
  await ensureStarted();
  await lowAlert(out, out.qty);
  return out;
}

export async function updateItem(id: number, patch: Partial<Pick<WarehouseItem, "location" | "minQty" | "cost" | "sku" | "note">>) {
  await db().update(W).set({ ...patch, updatedAt: new Date() }).where(eq(W.id, id));
}

export async function deleteItem(id: number) {
  await db().delete(W).where(eq(W.id, id));
}

// ---------------------------------------------------------------------------
// İçe aktarma

export type ImportRow = {
  product: string;
  variant?: string | null;
  color?: string | null;
  category?: string | null;
  collection?: string | null;
  qty: number;
  sku?: string | null;
  location?: string | null;
  cost?: number | null;
  minQty?: number | null;
  image?: string | null;
  shopifyVariantId?: string | null;
  upcoming?: boolean;
};

/**
 * merge: aynı ürün+beden+renk varsa adedi bu değere ayarlar (fark "sayım" hareketi olarak yazılır), yoksa ekler.
 * replace: depoyu sıfırlar ve listeyi baştan kurar.
 */
export async function importRows(
  rows: ImportRow[],
  mode: "merge" | "replace",
  opts: { startedAt?: Date; note?: string } = {},
) {
  let created = 0;
  let updated = 0;
  await db().transaction(async (tx) => {
    if (mode === "replace") {
      await tx.delete(M);
      await tx.delete(W);
    }
    const existing = await tx.select().from(W);
    const byKey = new Map(existing.map((e) => [e.key, e]));
    // Bedenli gerçek stok gelen ürünün "stok bekleniyor" satırını kaldır
    for (const r of rows) {
      if (r.upcoming || !r.variant) continue;
      const ph = byKey.get(itemKey(r.product, null, r.color));
      if (ph?.upcoming) {
        await tx.delete(W).where(eq(W.id, ph.id));
        byKey.delete(ph.key);
      }
    }
    for (const r of rows) {
      const key = itemKey(r.product, r.variant, r.color);
      const cur = byKey.get(key);
      if (cur) {
        const delta = r.qty - cur.qty;
        const [u] = await tx
          .update(W)
          .set({
            qty: r.qty,
            sku: r.sku ?? cur.sku,
            location: r.location ?? cur.location,
            cost: r.cost ?? cur.cost,
            minQty: r.minQty ?? cur.minQty,
            category: r.category ?? cur.category,
            collection: r.collection ?? cur.collection,
            image: cur.image ?? r.image ?? null,
            shopifyVariantId: cur.shopifyVariantId ?? r.shopifyVariantId ?? null,
            upcoming: r.upcoming ?? false,
            updatedAt: new Date(),
          })
          .where(eq(W.id, cur.id))
          .returning();
        if (delta) await tx.insert(M).values({ itemId: cur.id, delta, qtyAfter: u.qty, reason: "import", note: opts.note ?? "İçe aktarma" });
        updated++;
      } else {
        const [u] = await tx
          .insert(W)
          .values({
            key,
            product: r.product.trim(),
            variant: r.variant?.trim() || null,
            color: r.color?.trim() || null,
            qty: r.qty,
            sku: r.sku || null,
            location: r.location || null,
            cost: r.cost ?? null,
            minQty: r.minQty ?? null,
            category: r.category?.trim() || null,
            collection: r.collection?.trim() || null,
            image: r.image ?? null,
            shopifyVariantId: r.shopifyVariantId ?? null,
            upcoming: r.upcoming ?? false,
          })
          .returning();
        byKey.set(key, u);
        if (!r.upcoming) await tx.insert(M).values({ itemId: u.id, delta: r.qty, qtyAfter: r.qty, reason: "import", note: opts.note ?? "İçe aktarma" });
        created++;
      }
    }
  });
  if (opts.startedAt) await kvSet("warehouse_started_at", opts.startedAt.toISOString());
  else if (mode === "replace") await kvSet("warehouse_started_at", new Date().toISOString());
  else await ensureStarted();
  await attachImagesFromOrders();
  return { created, updated };
}

/** Görseli olmayan depo ürünlerine, eşleşen sipariş satırlarındaki ürün fotoğrafını ekler. */
async function attachImagesFromOrders() {
  const items = await db().select().from(W).where(sql`${W.image} is null`);
  if (!items.length) return;
  const orders = await db().select({ lineItems: schema.orders.lineItems }).from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(300);
  const byTitle = new Map<string, string>();
  for (const o of orders) for (const li of o.lineItems) if (li.image && !byTitle.has(norm(li.title))) byTitle.set(norm(li.title), li.image);
  for (const it of items) {
    const img = byTitle.get(norm(it.product));
    if (img) await db().update(W).set({ image: img }).where(eq(W.id, it.id));
  }
}

// ---------------------------------------------------------------------------
// Okuma

export async function getWarehouse() {
  const [items, moves, unmatched, started] = await Promise.all([
    db().select().from(W).orderBy(W.product, W.color, W.id),
    db()
      .select({ m: M, product: W.product, variant: W.variant, color: W.color })
      .from(M)
      .leftJoin(W, eq(W.id, M.itemId))
      .where(sql`${M.reason} <> 'unmatched'`)
      .orderBy(desc(M.createdAt), desc(M.id))
      .limit(40),
    db().select().from(M).where(eq(M.reason, "unmatched")).orderBy(desc(M.createdAt)),
    warehouseStartedAt(),
  ]);
  return { items, moves, unmatched, started };
}

export async function warehouseSummary() {
  const settings = await getSettings();
  const items = (await db().select().from(W)).filter((i) => !i.upcoming);
  const low = items.filter((i) => i.qty > 0 && i.qty <= (i.minQty ?? settings.lowStock));
  const out = items.filter((i) => i.qty <= 0);
  const [u] = await db().select({ n: sql<number>`count(*)::int` }).from(M).where(eq(M.reason, "unmatched"));
  return {
    count: items.length,
    units: items.reduce((s, i) => s + Math.max(0, i.qty), 0),
    low,
    out,
    unmatched: u?.n ?? 0,
  };
}

/** Paketleme ekranı için: sipariş satırına karşılık gelen raf/konum ve depo adedi */
export async function warehouseLookup() {
  const items = await db().select().from(W);
  return (li: LineItem) => findMatch(items, li) ?? null;
}

export type { Order };

/** Başlangıç tarihinden sonra gelmiş (DB'deki) siparişleri depoya uygular — geriye dönük düşme. */
export async function catchUpOrders() {
  const started = await warehouseStartedAt();
  if (!started) return 0;
  const rows = await db()
    .select()
    .from(schema.orders)
    .where(gte(schema.orders.createdAt, new Date(started)))
    .orderBy(schema.orders.createdAt);
  await applyOrdersToWarehouse(rows);
  return rows.length;
}

/** "Stok bekleniyor" ürünü için stok geldi: bedenleri girer, bekleyen satırı kaldırır. */
export async function receiveUpcoming(itemId: number, sizes: { variant: string; qty: number }[]) {
  const [ph] = await db().select().from(W).where(eq(W.id, itemId));
  if (!ph) throw new Error("Ürün bulunamadı");
  const rows: ImportRow[] = sizes
    .filter((s) => s.variant.trim() && s.qty >= 0)
    .map((s) => ({
      product: ph.product,
      variant: s.variant.trim(),
      color: ph.color,
      category: ph.category,
      collection: ph.collection,
      qty: s.qty,
      image: ph.image,
      location: ph.location,
      cost: ph.cost,
    }));
  if (!rows.length) throw new Error("En az bir beden gir");
  return importRows(rows, "merge", { note: "Stok geldi" });
}
