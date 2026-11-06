import "server-only";
import { cacheLife } from "next/cache";
import { kvGet, kvSet } from "@/db";
import { dayKey, TZ } from "./format";
import type { IgPost, Point } from "./metricool";

/**
 * Instagram API with Instagram Login (graph.instagram.com) — Metricool'a alternatif, ücretsiz.
 * Facebook sayfası gerekmez; hesap Profesyonel (İşletme/İçerik üreticisi) olmalı.
 * Token 60 gün geçerli; cron her gün kontrol edip yeniler.
 */
const GRAPH = "https://graph.instagram.com/v22.0";
export const IG_SCOPES = "instagram_business_basic,instagram_business_manage_insights";

export type IgToken = { token: string; userId: string; username?: string; expiresAt: number; obtainedAt: number };

export function instagramAppConfigured() {
  return !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export async function getIgToken(): Promise<IgToken | null> {
  if (process.env.INSTAGRAM_TOKEN) {
    return { token: process.env.INSTAGRAM_TOKEN, userId: "me", expiresAt: Infinity, obtainedAt: 0 };
  }
  return kvGet<IgToken>("ig_token");
}

export async function instagramConnected() {
  const t = await getIgToken();
  return !!t && t.expiresAt > Date.now();
}

export function authorizeUrl(appUrl: string, state: string) {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
  u.searchParams.set("redirect_uri", `${appUrl}/api/instagram/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

/** OAuth code → kısa token → 60 günlük token; kv'ye kaydeder. */
export async function exchangeCode(code: string, appUrl: string) {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: `${appUrl}/api/instagram/callback`,
    code,
  });
  const r1 = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body, cache: "no-store" });
  if (!r1.ok) throw new Error(`Instagram token (1): ${await r1.text()}`);
  const short = (await r1.json()) as { access_token: string; user_id: string | number };

  const u = new URL(`https://graph.instagram.com/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET!);
  u.searchParams.set("access_token", short.access_token);
  const r2 = await fetch(u, { cache: "no-store" });
  if (!r2.ok) throw new Error(`Instagram token (2): ${await r2.text()}`);
  const long = (await r2.json()) as { access_token: string; expires_in: number };

  const me = await fetch(`${GRAPH}/me?fields=user_id,username&access_token=${long.access_token}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ user_id?: string; username?: string }>) : null))
    .catch(() => null);

  const t: IgToken = {
    token: long.access_token,
    userId: String(me?.user_id ?? short.user_id),
    username: me?.username,
    expiresAt: Date.now() + long.expires_in * 1000,
    obtainedAt: Date.now(),
  };
  await kvSet("ig_token", t);
  return t;
}

/** Cron'dan çağrılır: token 24 saatten eski ve 15 günden az ömrü kaldıysa yeniler. */
export async function refreshIgTokenIfNeeded() {
  const t = await kvGet<IgToken>("ig_token");
  if (!t) return "none";
  const age = Date.now() - t.obtainedAt;
  const left = t.expiresAt - Date.now();
  if (age < 24 * 3_600_000 || left > 15 * 86_400_000) return "ok";
  const u = new URL("https://graph.instagram.com/refresh_access_token");
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", t.token);
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) return `refresh failed: ${await r.text()}`;
  const j = (await r.json()) as { access_token: string; expires_in: number };
  await kvSet("ig_token", { ...t, token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000, obtainedAt: Date.now() });
  return "refreshed";
}

export async function disconnectInstagram() {
  await kvSet("ig_token", null);
}

// ---------------------------------------------------------------------------

async function ig<T>(path: string, params: Record<string, string>): Promise<T> {
  const t = await getIgToken();
  if (!t) throw new Error("Instagram bağlı değil");
  const u = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", t.token);
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Instagram ${r.status}: ${txt.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

type InsightsResp = {
  data: { name: string; period: string; values?: { value: number; end_time: string }[]; total_value?: { value: number } }[];
};

const unix = (d: Date) => Math.floor(+d / 1000);

/** Günlük seri. API tek istekte en fazla 30 gün verir → parçalar. */
export async function graphTimeline(metric: "reach" | "follower_count" | "views" | "total_interactions", days: number): Promise<Point[]> {
  "use cache";
  cacheLife("hours");
  const out = new Map<string, number>();
  const now = new Date();
  // follower_count ve reach "day" dönemiyle seri verir; diğerleri total_value ister → günlük parçalara böl
  const series = metric === "reach" || metric === "follower_count";
  for (let start = days; start > 0; start -= 30) {
    const chunk = Math.min(30, start);
    const since = new Date(+now - start * 86_400_000);
    const until = new Date(+since + chunk * 86_400_000);
    try {
      if (series) {
        const r = await ig<InsightsResp>("me/insights", {
          metric,
          period: "day",
          since: String(unix(since)),
          until: String(unix(until)),
        });
        for (const v of r.data[0]?.values ?? []) {
          const k = dayKey(new Date(+new Date(v.end_time) - 1000));
          out.set(k, (out.get(k) ?? 0) + (v.value ?? 0));
        }
      } else {
        // total_value günlük değer vermez → gün gün sor (30 istek/parça; cache'lendiği için kabul)
        for (let d = 0; d < chunk; d++) {
          const s = new Date(+since + d * 86_400_000);
          const e = new Date(+s + 86_400_000);
          const r = await ig<InsightsResp>("me/insights", {
            metric,
            period: "day",
            metric_type: "total_value",
            since: String(unix(s)),
            until: String(unix(e)),
          }).catch(() => null);
          const val = r?.data[0]?.total_value?.value ?? 0;
          out.set(dayKey(s), val);
        }
      }
    } catch {
      /* bu parça yoksa (çok eski) atla */
    }
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value }));
}

type Media = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

export async function graphPosts(days: number): Promise<IgPost[]> {
  "use cache";
  cacheLife("hours");
  const since = Date.now() - days * 86_400_000;
  const r = await ig<{ data: Media[] }>("me/media", {
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: "50",
  });
  const media = r.data.filter((m) => +new Date(m.timestamp) >= since && m.media_product_type !== "STORY");

  const posts: IgPost[] = [];
  for (const m of media) {
    const reel = m.media_product_type === "REELS" || m.media_type === "VIDEO";
    const metrics = reel ? "views,reach,likes,comments,saved,shares" : "views,reach,likes,comments,saved,shares";
    const ins = await ig<InsightsResp>(`${m.id}/insights`, { metric: metrics }).catch(() =>
      ig<InsightsResp>(`${m.id}/insights`, { metric: "reach,saved" }).catch(() => null),
    );
    const g = (name: string) => {
      const d = ins?.data.find((x) => x.name === name);
      return d?.total_value?.value ?? d?.values?.[0]?.value ?? 0;
    };
    const likes = g("likes") || m.like_count || 0;
    const comments = g("comments") || m.comments_count || 0;
    const saves = g("saved");
    const shares = g("shares");
    posts.push({
      id: m.id,
      type: reel ? "reel" : "post",
      url: m.permalink,
      image: m.thumbnail_url ?? m.media_url ?? null,
      caption: m.caption ?? "",
      publishedAt: m.timestamp,
      reach: g("reach"),
      views: g("views"),
      likes,
      comments,
      saves,
      shares,
      interactions: likes + comments + saves + shares,
    });
  }
  return posts;
}

export { TZ };
