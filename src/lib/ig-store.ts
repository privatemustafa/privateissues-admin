import "server-only";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeStories } from "./ig-insights";
import { graphMedia, graphRange, instagramConnected } from "./instagram";
import { dayKey } from "./format";

// ---------------------------------------------------------------------------
// Story arşivi

/** Cron'dan çağrılır: aktif story'lerin son sayılarını yazar (24 saat dolunca API'den kalkıyorlar). */
export async function snapshotStories() {
  if (!(await instagramConnected())) return "bağlı değil";
  const list = await activeStories();
  for (const s of list) {
    const row = { ...s, updatedAt: new Date() };
    await db()
      .insert(schema.igStories)
      .values(row)
      .onConflictDoUpdate({ target: schema.igStories.id, set: row });
  }
  return list.length;
}

export async function listStories(days = 30) {
  return db()
    .select()
    .from(schema.igStories)
    .where(gte(schema.igStories.publishedAt, new Date(Date.now() - days * 86_400_000)))
    .orderBy(desc(schema.igStories.publishedAt));
}

// ---------------------------------------------------------------------------
// Müşteri şehirleri (Instagram takipçi şehirleriyle karşılaştırmak için)

const TR: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
export function normCity(s: string | null | undefined) {
  return (s ?? "")
    .split(",")[0]
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .replace(/\s+(province|ili|il)$/, "")
    .trim();
}

const PROVINCES = new Set(
  "adana adiyaman afyonkarahisar agri aksaray amasya ankara antalya ardahan artvin aydin balikesir bartin batman bayburt bilecik bingol bitlis bolu burdur bursa canakkale cankiri corum denizli diyarbakir duzce edirne elazig erzincan erzurum eskisehir gaziantep giresun gumushane hakkari hatay igdir isparta istanbul izmir kahramanmaras karabuk karaman kars kastamonu kayseri kilis kirikkale kirklareli kirsehir kocaeli konya kutahya malatya manisa mardin mersin mugla mus nevsehir nigde ordu osmaniye rize sakarya samsun sanliurfa siirt sinop sirnak sivas tekirdag tokat trabzon tunceli usak van yalova yozgat zonguldak".split(" "),
);
const ISTANBUL_DISTRICTS = new Set(
  "adalar arnavutkoy atasehir avcilar bagcilar bahcelievler bakirkoy basaksehir bayrampasa besiktas beykoz beylikduzu beyoglu buyukcekmece catalca cekmekoy esenler esenyurt eyupsultan eyup fatih gaziosmanpasa gungoren kadikoy kagithane kartal kucukcekmece maltepe pendik sancaktepe sariyer silivri sultanbeyli sultangazi sile sisli tuzla umraniye uskudar zeytinburnu".split(" "),
);
/** Türkiye adresinden il adını çıkar: il listesinde olanı seç, İstanbul ilçelerini İstanbul'a bağla. */
function provinceOf(a: { city: string | null; province: string | null }) {
  for (const v of [a.province, a.city]) if (PROVINCES.has(normCity(v))) return v as string;
  for (const v of [a.province, a.city]) if (ISTANBUL_DISTRICTS.has(normCity(v))) return "İstanbul";
  return a.province || a.city;
}

/** Siparişlerin şehre göre dağılımı. Türkiye'de Shopify "province" = il, "city" = ilçe → il kullanılır. */
export async function customerCities(days = 90) {
  const rows = await db()
    .select({ addr: schema.orders.shippingAddress })
    .from(schema.orders)
    .where(
      and(
        gte(schema.orders.createdAt, new Date(Date.now() - days * 86_400_000)),
        eq(schema.orders.test, false),
        isNull(schema.orders.cancelledAt),
      ),
    );
  const m = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    const a = r.addr;
    if (!a) continue;
    const tr = !a.country || /turk|türk/i.test(a.country);
    const label = (tr ? provinceOf(a) : a.city || a.province) ?? "";
    const k = normCity(label);
    if (!k) continue;
    const cur = m.get(k) ?? { label, value: 0 };
    cur.value++;
    m.set(k, cur);
  }
  return { total: rows.length, cities: [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.value - a.value) };
}

// ---------------------------------------------------------------------------
// Drop'lar

export async function listDrops() {
  return db().select().from(schema.drops).orderBy(desc(schema.drops.launchAt));
}

export async function addDrop(input: { name: string; teaserAt: Date; launchAt: Date; note?: string | null }) {
  await db().insert(schema.drops).values({ name: input.name, teaserAt: input.teaserAt, launchAt: input.launchAt, note: input.note ?? null });
}

export async function deleteDrop(id: number) {
  await db().delete(schema.drops).where(eq(schema.drops.id, id));
}

export type DropDay = { day: string; reach: number; gained: number; orders: number; revenue: number; phase: "teaser" | "launch" | "after" };

/**
 * Drop raporu: teaser başlangıcından lansman + 14 güne kadar günlük erişim, yeni takipçi, sipariş, ciro.
 * Not: follower_count yalnızca son 30 gün için gelir; Shopify da varsayılan olarak son 60 günü verir.
 */
export async function dropReport(drop: { teaserAt: Date; launchAt: Date }) {
  const start = new Date(drop.teaserAt);
  const end = new Date(Math.min(Date.now(), +drop.launchAt + 15 * 86_400_000));
  const [reach, gained, orders] = await Promise.all([
    graphRange("reach", start.toISOString(), end.toISOString()).catch(() => []),
    graphRange("follower_count", start.toISOString(), end.toISOString()).catch(() => []),
    db()
      .select({ createdAt: schema.orders.createdAt, total: schema.orders.total })
      .from(schema.orders)
      .where(
        and(
          gte(schema.orders.createdAt, start),
          lt(schema.orders.createdAt, end),
          eq(schema.orders.test, false),
          isNull(schema.orders.cancelledAt),
        ),
      ),
  ]);
  const rMap = new Map(reach.map((p) => [p.day, p.value]));
  const gMap = new Map(gained.map((p) => [p.day, p.value]));
  const launchKey = dayKey(drop.launchAt);
  const days: DropDay[] = [];
  for (let t = +start; t < +end; t += 86_400_000) {
    const k = dayKey(new Date(t));
    if (days.at(-1)?.day === k) continue;
    days.push({
      day: k,
      reach: rMap.get(k) ?? 0,
      gained: Math.max(0, gMap.get(k) ?? 0),
      orders: 0,
      revenue: 0,
      phase: k < launchKey ? "teaser" : k === launchKey ? "launch" : "after",
    });
  }
  const idx = new Map(days.map((d, i) => [d.day, i]));
  for (const o of orders) {
    const i = idx.get(dayKey(o.createdAt));
    if (i === undefined) continue;
    days[i].orders++;
    days[i].revenue += o.total;
  }
  const sum = (xs: DropDay[], k: "reach" | "gained" | "orders" | "revenue") => xs.reduce((s, d) => s + d[k], 0);
  const teaser = days.filter((d) => d.phase === "teaser");
  const launchWeek = days.filter((d) => d.phase !== "teaser").slice(0, 7);
  return {
    days,
    teaser: { reach: sum(teaser, "reach"), gained: sum(teaser, "gained"), days: teaser.length },
    launchWeek: {
      reach: sum(launchWeek, "reach"),
      gained: sum(launchWeek, "gained"),
      orders: sum(launchWeek, "orders"),
      revenue: sum(launchWeek, "revenue"),
    },
  };
}

// ---------------------------------------------------------------------------
// Haftalık rapor verisi (pazartesi bildirimi)

export async function weeklyInstagram() {
  if (!(await instagramConnected())) return null;
  const until = new Date();
  const since = new Date(+until - 7 * 86_400_000);
  const [gained, reach, media] = await Promise.all([
    graphRange("follower_count", since.toISOString(), until.toISOString()).catch(() => []),
    graphRange("reach", since.toISOString(), until.toISOString()).catch(() => []),
    graphMedia(12).catch(() => []),
  ]);
  const week = media.filter((m) => +new Date(m.publishedAt) >= +since);
  const best = [...week].sort((a, b) => b.reach - a.reach)[0] ?? null;
  return {
    gained: gained.reduce((s, p) => s + Math.max(0, p.value), 0),
    reach: reach.reduce((s, p) => s + p.value, 0),
    posts: week.length,
    best,
  };
}
