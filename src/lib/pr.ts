import "server-only";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PrItem, PrPerson } from "@/db/schema";
import { igGet, instagramConnected } from "./instagram";
import { moveStock } from "./warehouse";
import { once } from "./notify";
import { compact } from "./format";
import { waNumber } from "./ship";

/**
 * PR / influencer takibi.
 * Otomasyon:
 *  - Gönderim kaydı depodan stok düşer (hareket nedeni "pr").
 *  - Kişinin Instagram profili (takipçi, foto) ve son paylaşımları Business Discovery ile çekilir;
 *    açıklamasında Private Issues geçen paylaşımlar otomatik eşleşir → bildirim.
 *  - Bizi fotoğrafta etiketleyen paylaşımlar (me/tags) da taranır (izin varsa).
 *  - Belirlenen günde paylaşım yoksa hatırlatma bildirimi (WhatsApp linkiyle).
 *  - Kişiye özel indirim kodu varsa o kodla gelen siparişler kişiye yazılır.
 */

const ABOUT_US = /private\s*issues|privateissues/i;
const APP = () => (process.env.APP_URL || "").replace(/\/$/, "");
const P = schema.prPeople;
const S = schema.prSends;
const POSTS = schema.prPosts;

export const REMIND_AFTER_DAYS = 10;
export const GIVE_UP_AFTER_DAYS = 30;

export function normHandle(s: string) {
  const m = s.trim().match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : s).replace(/^@+/, "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Kayıt

export async function upsertPerson(input: { handle: string; name?: string | null; phone?: string | null; code?: string | null; category?: string | null }) {
  const handle = normHandle(input.handle);
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) throw new Error("Geçersiz Instagram kullanıcı adı");
  const patch = Object.fromEntries(
    Object.entries({ name: input.name, phone: input.phone, code: input.code?.toUpperCase(), category: input.category }).filter(
      ([, v]) => v != null && v !== "",
    ),
  );
  const [row] = await db()
    .insert(P)
    .values({ handle, ...patch })
    .onConflictDoUpdate({ target: P.handle, set: Object.keys(patch).length ? patch : { handle } })
    .returning();
  return row;
}

export async function createSend(input: {
  handle: string;
  name?: string | null;
  phone?: string | null;
  code?: string | null;
  category?: string | null;
  items: { itemId: number; qty: number }[];
  note?: string | null;
  sentAt?: Date;
}) {
  const person = await upsertPerson(input);
  const ids = input.items.filter((i) => i.qty > 0).map((i) => i.itemId);
  const wh = ids.length ? await db().select().from(schema.warehouseItems).where(inArray(schema.warehouseItems.id, ids)) : [];
  const items: PrItem[] = input.items
    .filter((i) => i.qty > 0)
    .map((i) => {
      const w = wh.find((x) => x.id === i.itemId);
      return {
        itemId: i.itemId,
        product: w?.product ?? "Ürün",
        variant: w?.variant ?? null,
        qty: i.qty,
        cost: w?.cost ?? null,
        image: w?.image ?? null,
      };
    });
  const [send] = await db()
    .insert(S)
    .values({ personId: person.id, items, note: input.note || null, sentAt: input.sentAt ?? new Date() })
    .returning();
  for (const it of items) {
    if (!it.itemId) continue;
    await moveStock({
      itemId: it.itemId,
      reason: "pr",
      delta: -it.qty,
      note: `PR → @${person.handle}`,
      ref: `pr:${send.id}`,
      refName: `@${person.handle}`,
    });
  }
  // Profili hemen doldurmayı dene (hata önemli değil)
  await scanPerson(person).catch(() => null);
  return send;
}

/** Depo ekranından PR olarak düşülen ürünü (stok zaten düştü) PR takibine ekler. Aynı gün aynı kişiye olan gönderime eklenir. */
export async function recordSendFromDepo(handle: string, itemId: number, qty: number, note: string | null) {
  const person = await upsertPerson({ handle });
  const [w] = await db().select().from(schema.warehouseItems).where(eq(schema.warehouseItems.id, itemId));
  const item: PrItem = { itemId, product: w?.product ?? "Ürün", variant: w?.variant ?? null, qty, cost: w?.cost ?? null, image: w?.image ?? null };
  const today = new Date(Date.now() - 12 * 3_600_000);
  const [open] = await db()
    .select()
    .from(S)
    .where(and(eq(S.personId, person.id), gte(S.sentAt, today)))
    .orderBy(desc(S.sentAt))
    .limit(1);
  const cleanNote = note?.replace(/@[A-Za-z0-9._]+/, "").trim() || null;
  if (open) {
    await db().update(S).set({ items: [...open.items, item] }).where(eq(S.id, open.id));
  } else {
    await db().insert(S).values({ personId: person.id, items: [item], note: cleanNote });
    await scanPerson(person).catch(() => null);
  }
}

export async function deleteSend(id: number, restock: boolean) {
  const [send] = await db().select().from(S).where(eq(S.id, id));
  if (!send) return;
  const [person] = await db().select().from(P).where(eq(P.id, send.personId));
  if (restock) {
    for (const it of send.items) {
      if (!it.itemId) continue;
      await moveStock({
        itemId: it.itemId,
        reason: "pr",
        delta: it.qty,
        note: `PR iptal ← @${person?.handle ?? "?"}`,
        ref: `pr:${send.id}:undo`,
      }).catch(() => null);
    }
  }
  await db().update(POSTS).set({ sendId: null }).where(eq(POSTS.sendId, id));
  await db().delete(S).where(eq(S.id, id));
}

export async function setSendStatus(id: number, status: "waiting" | "posted" | "no_post") {
  await db()
    .update(S)
    .set({ status, postedAt: status === "posted" ? new Date() : null })
    .where(eq(S.id, id));
}

export async function updatePerson(id: number, patch: { name?: string | null; phone?: string | null; code?: string | null; category?: string | null; note?: string | null }) {
  await db()
    .update(P)
    .set({ ...patch, code: patch.code ? patch.code.toUpperCase() : patch.code })
    .where(eq(P.id, id));
}

/** Elle paylaşım linki ekle (story ya da otomatik bulunamayan paylaşım için). */
export async function addManualPost(sendId: number, url: string) {
  const [send] = await db().select().from(S).where(eq(S.id, sendId));
  if (!send) throw new Error("Gönderim bulunamadı");
  const clean = url.trim().split("?")[0];
  if (!/instagram\.com\//.test(clean)) throw new Error("Instagram linki gir");
  await db()
    .insert(POSTS)
    .values({
      id: `url:${clean}`,
      personId: send.personId,
      sendId,
      source: "manual",
      permalink: clean,
      mediaType: /\/stories\//.test(clean) ? "STORY" : /\/reel\//.test(clean) ? "VIDEO" : null,
      postedAt: new Date(),
    })
    .onConflictDoNothing();
  await db().update(S).set({ status: "posted", postedAt: send.postedAt ?? new Date() }).where(eq(S.id, sendId));
}

// ---------------------------------------------------------------------------
// Otomatik tarama

type DMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp: string;
  media_type?: string;
  media_product_type?: string;
  like_count?: number;
  comments_count?: number;
  view_count?: number;
  media_url?: string;
  thumbnail_url?: string;
};
type Discovery = {
  business_discovery?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: DMedia[] };
  };
};

async function discover(handle: string) {
  const base = "id,username,name,profile_picture_url,followers_count,media_count";
  const media = "id,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count,media_url,thumbnail_url";
  try {
    return await igGet<Discovery>("me", { fields: `business_discovery.username(${handle}){${base},media.limit(30){${media},view_count}}` });
  } catch {
    // view_count bazı sürümlerde yok → onsuz dene
    return igGet<Discovery>("me", { fields: `business_discovery.username(${handle}){${base},media.limit(30){${media}}}` });
  }
}

/** Paylaşımı en yakın (öncesindeki) gönderime bağla; gönderimi "paylaştı" yap; ilk kez görülüyorsa bildir. */
async function recordPost(person: PrPerson, m: DMedia, source: "discovery" | "tag") {
  const postedAt = new Date(m.timestamp);
  const sends = await db().select().from(S).where(eq(S.personId, person.id)).orderBy(desc(S.sentAt));
  const send = sends.find((s) => s.sentAt <= postedAt) ?? null;
  // Gönderimden önceki paylaşımları kaydetme (eski işbirlikleri karışmasın), gönderim yoksa da kaydetme
  if (!send) return false;

  const row = {
    id: m.id,
    personId: person.id,
    sendId: send.id,
    source,
    permalink: m.permalink ?? null,
    mediaType: m.media_product_type === "REELS" ? "VIDEO" : (m.media_type ?? null),
    caption: m.caption ?? null,
    image: m.thumbnail_url ?? m.media_url ?? null,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    views: m.view_count ?? null,
    postedAt,
    updatedAt: new Date(),
  };
  await db()
    .insert(POSTS)
    .values(row)
    .onConflictDoUpdate({
      target: POSTS.id,
      set: { likes: row.likes, comments: row.comments, views: row.views, image: row.image, updatedAt: row.updatedAt },
    });
  if (send.status !== "posted") {
    await db().update(S).set({ status: "posted", postedAt }).where(eq(S.id, send.id));
  }
  {
    // once() aynı paylaşım için ikinci kez bildirmez
    await once("pr-post", m.id, {
      title: `@${person.handle} paylaştı`,
      body: [
        m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Post",
        m.like_count != null ? `${compact(m.like_count)} beğeni` : null,
        person.followers ? `${compact(person.followers)} takipçili hesap` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      url: `${APP()}/pr`,
      tag: `pr-${person.id}`,
    });
  }
  return true;
}

export async function scanPerson(person: PrPerson) {
  if (!(await instagramConnected())) return { ok: false, error: "Instagram bağlı değil" };
  let d: Discovery;
  try {
    d = await discover(person.handle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = /does not exist|cannot be found|not found|110/.test(msg)
      ? "Hesap bulunamadı ya da kişisel hesap (otomatik takip yalnızca işletme/içerik üreticisi hesaplarında çalışır)"
      : msg.slice(0, 160);
    await db().update(P).set({ scanError: reason, scannedAt: new Date() }).where(eq(P.id, person.id));
    return { ok: false, error: reason };
  }
  const bd = d.business_discovery;
  if (!bd) return { ok: false, error: "Veri gelmedi" };
  await db()
    .update(P)
    .set({
      igId: bd.id,
      name: person.name ?? bd.name ?? null,
      followers: bd.followers_count ?? null,
      mediaCount: bd.media_count ?? null,
      avatar: bd.profile_picture_url ?? null,
      scanError: null,
      scannedAt: new Date(),
    })
    .where(eq(P.id, person.id));
  let found = 0;
  for (const m of bd.media?.data ?? []) {
    if (m.caption && ABOUT_US.test(m.caption)) {
      if (await recordPost({ ...person, followers: bd.followers_count ?? person.followers }, m, "discovery")) found++;
    }
  }
  return { ok: true, found };
}

/** Bizi fotoğrafta etiketleyen paylaşımlar. instagram_manage_comments izni yoksa sessizce boş döner. */
async function scanTags() {
  const r = await igGet<{ data: (DMedia & { username?: string })[] }>("me/tags", {
    fields: "id,username,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count,media_url,thumbnail_url",
    limit: "50",
  }).catch(() => null);
  if (!r) return 0;
  const people = await db().select().from(P);
  const byHandle = new Map(people.map((p) => [p.handle, p]));
  let n = 0;
  for (const m of r.data) {
    const p = m.username ? byHandle.get(m.username.toLowerCase()) : undefined;
    if (p && (await recordPost(p, m, "tag"))) n++;
  }
  return n;
}

/**
 * Cron'dan çağrılır. Son 120 günde gönderim yapılan herkesi tarar (kişi başı en fazla 6 saatte bir),
 * etiketleri tarar, süresi dolan gönderimler için hatırlatır.
 */
export async function scanAllPr({ force = false } = {}) {
  if (!(await instagramConnected())) return "bağlı değil";
  const since = new Date(Date.now() - 120 * 86_400_000);
  const recent = await db().select({ personId: S.personId }).from(S).where(gte(S.sentAt, since));
  const ids = [...new Set(recent.map((r) => r.personId))];
  const people = ids.length ? await db().select().from(P).where(inArray(P.id, ids)) : [];
  let scanned = 0;
  let found = 0;
  for (const p of people) {
    if (!force && p.scannedAt && Date.now() - +p.scannedAt < 6 * 3_600_000) continue;
    const r = await scanPerson(p);
    scanned++;
    if (r.ok) found += r.found ?? 0;
  }
  found += await scanTags();

  // Hatırlatma ve vazgeçme
  const waiting = await db()
    .select({ send: S, person: P })
    .from(S)
    .innerJoin(P, eq(P.id, S.personId))
    .where(eq(S.status, "waiting"));
  for (const { send, person } of waiting) {
    const days = (Date.now() - +send.sentAt) / 86_400_000;
    if (days >= GIVE_UP_AFTER_DAYS) {
      await db().update(S).set({ status: "no_post" }).where(eq(S.id, send.id));
    } else if (days >= REMIND_AFTER_DAYS && !send.remindedAt) {
      await db().update(S).set({ remindedAt: new Date() }).where(eq(S.id, send.id));
      await once("pr-remind", String(send.id), {
        title: `@${person.handle} henüz paylaşmadı`,
        body: `${Math.floor(days)} gün önce ${send.items.map((i) => i.product).join(", ")} gönderildi. Hatırlatmak ister misin?`,
        url: `${APP()}/pr`,
        tag: `pr-remind-${send.id}`,
      });
    }
  }
  return { scanned, found, people: people.length };
}

// ---------------------------------------------------------------------------
// Okuma + etki

export function reminderLink(person: { phone: string | null; name: string | null; handle: string }, products: string[]) {
  const n = waNumber(person.phone);
  const hi = person.name ? person.name.split(" ")[0] : `@${person.handle}`;
  const text = `Selam ${hi}! Private Issues'tan yazıyorum. ${products.join(", ")} eline ulaştı mı, nasıl buldun? Giyersen bir story/post'ta @privateissues.wrld etiketlersen çok seviniriz 🖤`;
  return n
    ? `https://wa.me/${n}?text=${encodeURIComponent(text)}`
    : `https://ig.me/m/${person.handle}`;
}

export async function prOverview() {
  const [people, sends, posts] = await Promise.all([
    db().select().from(P).orderBy(desc(P.createdAt)),
    db().select().from(S).orderBy(desc(S.sentAt)),
    db().select().from(POSTS).orderBy(desc(POSTS.postedAt)),
  ]);
  const firstSend = sends.at(-1)?.sentAt ?? new Date();
  const orders = sends.length
    ? await db()
        .select({ createdAt: schema.orders.createdAt, total: schema.orders.total, codes: schema.orders.discountCodes })
        .from(schema.orders)
        .where(and(gte(schema.orders.createdAt, firstSend), eq(schema.orders.test, false), isNull(schema.orders.cancelledAt)))
    : [];

  const rows = people
    .map((p) => {
      const ps = sends.filter((s) => s.personId === p.id);
      const pp = posts.filter((x) => x.personId === p.id);
      const cost = ps.reduce((s, x) => s + x.items.reduce((a, i) => a + (i.cost ?? 0) * i.qty, 0), 0);
      const units = ps.reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty, 0), 0);
      const code = p.code?.toUpperCase();
      const codeOrders = code ? orders.filter((o) => o.codes.some((c) => c.toUpperCase() === code)) : [];
      const after = orders.filter((o) => pp.some((x) => +o.createdAt >= +x.postedAt && +o.createdAt < +x.postedAt + 48 * 3_600_000));
      const likes = pp.reduce((s, x) => s + (x.likes ?? 0), 0);
      return {
        person: p,
        sends: ps,
        posts: pp,
        cost,
        units,
        likes,
        code: { n: codeOrders.length, revenue: codeOrders.reduce((s, o) => s + o.total, 0) },
        after: { n: after.length, revenue: after.reduce((s, o) => s + o.total, 0) },
        lastSent: ps[0]?.sentAt ?? null,
      };
    })
    .filter((r) => r.sends.length || r.posts.length);

  const totals = {
    people: rows.length,
    sends: sends.length,
    posted: sends.filter((s) => s.status === "posted").length,
    waiting: sends.filter((s) => s.status === "waiting").length,
    units: rows.reduce((s, r) => s + r.units, 0),
    cost: rows.reduce((s, r) => s + r.cost, 0),
    codeRevenue: rows.reduce((s, r) => s + r.code.revenue, 0),
    afterRevenue: rows.reduce((s, r) => s + r.after.revenue, 0),
  };
  return { rows, totals };
}

/** Depo seçimi için ürün listesi (stokta olanlar). */
export async function prItemOptions() {
  const items = await db()
    .select({
      id: schema.warehouseItems.id,
      product: schema.warehouseItems.product,
      variant: schema.warehouseItems.variant,
      color: schema.warehouseItems.color,
      qty: schema.warehouseItems.qty,
    })
    .from(schema.warehouseItems)
    .where(and(eq(schema.warehouseItems.upcoming, false), gte(schema.warehouseItems.qty, 1)));
  return items
    .map((i) => ({ id: i.id, label: [i.product, i.color, i.variant].filter(Boolean).join(" · "), qty: i.qty }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

export async function knownHandles() {
  return db().select({ handle: P.handle, name: P.name, phone: P.phone, code: P.code }).from(P).orderBy(P.handle);
}

