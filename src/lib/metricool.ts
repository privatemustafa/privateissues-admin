import "server-only";
import { cacheLife } from "next/cache";
import { TZ } from "./format";

/**
 * Metricool API (Instagram verisi bu yoldan geliyor; Meta app review gerekmez).
 * Docs: https://app.metricool.com/resources/apidocs/index.html
 * Auth: X-Mc-Auth header + userId & blogId query.
 */
const BASE = "https://app.metricool.com/api";

export function metricoolConfigured() {
  return !!(process.env.METRICOOL_TOKEN && process.env.METRICOOL_USER_ID && process.env.METRICOOL_BLOG_ID);
}

function iso(d: Date, end = false) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  return `${key}T${end ? "23:59:59" : "00:00:00"}+03:00`;
}

async function mc<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({
    userId: process.env.METRICOOL_USER_ID!,
    blogId: process.env.METRICOOL_BLOG_ID!,
    ...params,
  });
  const res = await fetch(`${BASE}${path}?${q}`, {
    headers: { "X-Mc-Auth": process.env.METRICOOL_TOKEN!, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Metricool ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export type Point = { day: string; value: number };

type TimelineResponse = {
  data?: { metric?: string; values?: { dateTime: string; value: number | null }[] }[];
};

/** Hesap metriği zaman serisi (followers, reach, views, postsInteractions, followersGained…) */
export async function igTimeline(metric: string, days: number): Promise<Point[]> {
  "use cache";
  cacheLife("hours");
  const to = new Date();
  const from = new Date(+to - (days - 1) * 86_400_000);
  const r = await mc<TimelineResponse>("/v2/analytics/timelines", {
    from: iso(from),
    to: iso(to, true),
    timezone: TZ,
    metric,
    network: "instagram",
    subject: "account",
  });
  const values = r.data?.[0]?.values ?? [];
  const byDay = new Map<string, number>();
  for (const v of values) {
    const k = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(v.dateTime));
    byDay.set(k, (byDay.get(k) ?? 0) + (v.value ?? 0));
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value }));
}

export type IgPost = {
  id: string;
  type: "post" | "reel";
  url: string | null;
  image: string | null;
  caption: string;
  publishedAt: string;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  interactions: number;
};

// Metricool alan adları sürüme göre değişebiliyor → savunmacı okuma
type Raw = Record<string, unknown>;
const num = (o: Raw, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v !== "" && !isNaN(Number(v))) return Number(v);
  }
  return 0;
};
const str = (o: Raw, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && "dateTime" in (v as Raw)) return String((v as Raw).dateTime);
  }
  return null;
};

function mapPost(p: Raw, type: "post" | "reel"): IgPost {
  const likes = num(p, "likes", "likeCount");
  const comments = num(p, "comments", "commentsCount");
  const saves = num(p, "saved", "saves");
  const shares = num(p, "shares");
  return {
    id: str(p, "postId", "id", "reelId") ?? Math.random().toString(36),
    type,
    url: str(p, "url", "permalink", "link"),
    image: str(p, "imageUrl", "thumbnailUrl", "picture", "image", "mediaUrl"),
    caption: str(p, "content", "caption", "text") ?? "",
    publishedAt: str(p, "publishedAt", "created", "date", "timestamp") ?? new Date().toISOString(),
    reach: num(p, "reach"),
    views: num(p, "views", "videoViews", "plays", "impressions"),
    likes,
    comments,
    saves,
    shares,
    interactions: num(p, "interactions", "engagement") || likes + comments + saves + shares,
  };
}

export async function igPosts(days: number): Promise<IgPost[]> {
  "use cache";
  cacheLife("hours");
  const to = new Date();
  const from = new Date(+to - (days - 1) * 86_400_000);
  const params = { from: iso(from), to: iso(to, true), timezone: TZ };
  const [posts, reels] = await Promise.all([
    mc<{ data?: Raw[] } | Raw[]>("/v2/analytics/posts/instagram", params).catch(() => ({ data: [] })),
    mc<{ data?: Raw[] } | Raw[]>("/v2/analytics/reels/instagram", params).catch(() => ({ data: [] })),
  ]);
  const list = (x: { data?: Raw[] } | Raw[]) => (Array.isArray(x) ? x : (x.data ?? []));
  return [...list(posts).map((p) => mapPost(p, "post")), ...list(reels).map((p) => mapPost(p, "reel"))].sort(
    (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt),
  );
}
