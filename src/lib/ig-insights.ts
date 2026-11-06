import "server-only";
import { cacheLife } from "next/cache";
import { igGet } from "./instagram";
import { TZ } from "./format";

/**
 * Instagram hesap içgörüleri (kitle, saat, erişim kaynağı, story).
 * Hepsi graph.facebook.com / graph.instagram.com üzerinden `me/insights`.
 * Not: online_followers ve follower_count 100 takipçinin altında boş döner.
 */

type Result = { dimension_values: string[]; value: number };
type TotalResp = {
  data: {
    name: string;
    total_value?: { value: number; breakdowns?: { dimension_keys: string[]; results: Result[] }[] };
  }[];
};
export type Slice = { key: string; value: number };

const unix = (d: Date) => String(Math.floor(+d / 1000));

function slices(r: TotalResp | null): Slice[] {
  const res = r?.data[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return res
    .map((x) => ({ key: x.dimension_values.join(" · "), value: x.value }))
    .sort((a, b) => b.value - a.value);
}

/** Takipçi ya da etkileşen kitle dağılımı (şehir, ülke, yaş, cinsiyet). */
export async function demographics(
  metric: "follower_demographics" | "engaged_audience_demographics",
  breakdown: "city" | "country" | "age" | "gender",
): Promise<Slice[]> {
  "use cache";
  cacheLife("hours");
  for (const timeframe of ["this_month", "this_week", "last_30_days"]) {
    const r = await igGet<TotalResp>("me/insights", {
      metric,
      period: "lifetime",
      metric_type: "total_value",
      timeframe,
      breakdown,
    }).catch(() => null);
    const s = slices(r);
    if (s.length) return s;
  }
  return [];
}

/** Son `days` günün toplamı + kırılımı (ör. erişim: takipçi / takipçi değil). */
export async function totalWithBreakdown(
  metric: "reach" | "views" | "follows_and_unfollows" | "profile_links_taps" | "total_interactions",
  breakdown: "follow_type" | "media_product_type" | "contact_button_type",
  days = 30,
): Promise<{ total: number; slices: Slice[] } | null> {
  "use cache";
  cacheLife("hours");
  const until = new Date();
  const since = new Date(+until - Math.min(days, 30) * 86_400_000);
  const r = await igGet<TotalResp>("me/insights", {
    metric,
    period: "day",
    metric_type: "total_value",
    breakdown,
    since: unix(since),
    until: unix(until),
  }).catch(() => null);
  if (!r?.data[0]) return null;
  return { total: r.data[0].total_value?.value ?? 0, slices: slices(r) };
}

/** Bir saat diliminin UTC farkı (dakika), verilen anda. */
function tzOffset(tz: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return (asUtc - +at) / 60_000;
}

/**
 * Takipçilerin saat saat çevrimiçi olma ortalaması (İstanbul saatiyle, 0–23).
 * Instagram saatleri Pasifik saatiyle verir → İstanbul'a kaydırılır.
 */
export async function onlineFollowersByHour(): Promise<number[] | null> {
  "use cache";
  cacheLife("hours");
  const until = new Date();
  const since = new Date(+until - 29 * 86_400_000);
  const r = await igGet<{ data: { values?: { value: Record<string, number> | number; end_time: string }[] }[] }>(
    "me/insights",
    { metric: "online_followers", period: "lifetime", since: unix(since), until: unix(until) },
  ).catch(() => null);
  const days = (r?.data[0]?.values ?? []).filter((v) => v.value && typeof v.value === "object") as {
    value: Record<string, number>;
    end_time: string;
  }[];
  if (!days.length) return null;
  const sum = new Array(24).fill(0);
  const n = new Array(24).fill(0);
  for (const d of days) {
    const at = new Date(d.end_time);
    const shift = Math.round((tzOffset(TZ, at) - tzOffset("America/Los_Angeles", at)) / 60);
    for (const [h, v] of Object.entries(d.value)) {
      const ist = (((Number(h) + shift) % 24) + 24) % 24;
      sum[ist] += v;
      n[ist]++;
    }
  }
  return sum.map((s, i) => (n[i] ? Math.round(s / n[i]) : 0));
}

// ---------------------------------------------------------------------------
// Story'ler (yalnızca son 24 saat API'de durur)

export type StorySnapshot = {
  id: string;
  publishedAt: Date;
  mediaType: string | null;
  permalink: string | null;
  image: string | null;
  views: number;
  reach: number;
  replies: number;
  shares: number;
  interactions: number;
  follows: number;
  profileVisits: number;
  tapsForward: number;
  tapsBack: number;
  exits: number;
  swipeForward: number;
};

type ValResp = { data: { name: string; values?: { value: number }[]; total_value?: { value: number; breakdowns?: { results: Result[] }[] } }[] };

export async function activeStories(): Promise<StorySnapshot[]> {
  const r = await igGet<{
    data: { id: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp: string }[];
  }>("me/stories", { fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp" }).catch(() => null);
  const list = r?.data ?? [];

  return Promise.all(
    list.map(async (s) => {
      const main = await igGet<ValResp>(`${s.id}/insights`, {
        metric: "views,reach,replies,shares,total_interactions,follows,profile_visits",
      }).catch(() =>
        igGet<ValResp>(`${s.id}/insights`, { metric: "reach,replies" }).catch(() => null),
      );
      const nav = await igGet<ValResp>(`${s.id}/insights`, {
        metric: "navigation",
        breakdown: "story_navigation_action_type",
      }).catch(() => null);
      const g = (name: string) => {
        const d = main?.data.find((x) => x.name === name);
        return d?.total_value?.value ?? d?.values?.[0]?.value ?? 0;
      };
      const navRes = nav?.data[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      const n = (k: string) => navRes.find((x) => x.dimension_values[0] === k)?.value ?? 0;
      return {
        id: s.id,
        publishedAt: new Date(s.timestamp),
        mediaType: s.media_type ?? null,
        permalink: s.permalink ?? null,
        image: s.thumbnail_url ?? s.media_url ?? null,
        views: g("views"),
        reach: g("reach"),
        replies: g("replies"),
        shares: g("shares"),
        interactions: g("total_interactions"),
        follows: g("follows"),
        profileVisits: g("profile_visits"),
        tapsForward: n("TAP_FORWARD"),
        tapsBack: n("TAP_BACK"),
        exits: n("TAP_EXIT"),
        swipeForward: n("SWIPE_FORWARD"),
      };
    }),
  );
}
