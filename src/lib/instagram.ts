import "server-only";
import { cacheLife } from "next/cache";
import { kvGet, kvSet } from "@/db";
import { dayKey, TZ } from "./format";
import type { IgPost, Point } from "./metricool";

/**
 * Instagram verisi — iki yol:
 *  - "fb"  Unified login (Ekim 2026 sonrası açılan Meta uygulamaları): Facebook Login for Business
 *          yapılandırması (INSTAGRAM_CONFIG_ID) → graph.facebook.com, sistem-kullanıcı token'ı, süresi dolmaz.
 *  - "ig"  Eski "Instagram login" (graph.instagram.com) — eski uygulamalar için; token 60 gün, cron yeniler.
 * Facebook sayfası gerekmez; hesap Profesyonel (İşletme/İçerik üreticisi) olmalı.
 */
const FB_VER = "v24.0";
const HOSTS = { fb: `https://graph.facebook.com/${FB_VER}`, ig: "https://graph.instagram.com/v22.0" } as const;
export const IG_SCOPES = "instagram_business_basic,instagram_business_manage_insights";
const NEVER = Date.UTC(2100, 0, 1);

export type IgToken = {
  token: string;
  userId: string;
  username?: string;
  expiresAt: number;
  obtainedAt: number;
  host?: "fb" | "ig";
};

const unifiedMode = () => !!process.env.INSTAGRAM_CONFIG_ID;

export function instagramAppConfigured() {
  return !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

export async function getIgToken(): Promise<IgToken | null> {
  if (process.env.INSTAGRAM_TOKEN) {
    const uid = process.env.INSTAGRAM_USER_ID;
    return { token: process.env.INSTAGRAM_TOKEN, userId: uid || "me", expiresAt: NEVER, obtainedAt: 0, host: uid ? "fb" : "ig" };
  }
  return kvGet<IgToken>("ig_token");
}

export async function instagramConnected() {
  const t = await getIgToken();
  return !!t && t.expiresAt > Date.now();
}

export function authorizeUrl(appUrl: string, state: string) {
  const redirect = `${appUrl}/api/instagram/callback`;
  if (unifiedMode()) {
    const u = new URL(`https://www.facebook.com/${FB_VER}/dialog/oauth`);
    u.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
    u.searchParams.set("redirect_uri", redirect);
    u.searchParams.set("config_id", process.env.INSTAGRAM_CONFIG_ID!);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("override_default_response_type", "true");
    u.searchParams.set("state", state);
    return u.toString();
  }
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

async function getJson<T>(u: URL | string): Promise<T | null> {
  try {
    const r = await fetch(u, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Unified login token'ından Instagram hesap kimliğini bul (birkaç yol dener). Bulamazsa teşhis notu döner. */
async function findIgAccount(token: string): Promise<{ id: string; username?: string } | { error: string }> {
  const base = HOSTS.fb;
  const tk = encodeURIComponent(token);
  const appToken = encodeURIComponent(`${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET}`);
  const named = async (id: string) => {
    const acc = await getJson<{ id: string; username?: string }>(`${base}/${id}?fields=id,username&access_token=${tk}`);
    return acc?.username ? acc : null;
  };

  // 1) Sistem kullanıcısına atanmış Instagram hesapları
  const a = await getJson<{ data?: { id: string; username?: string }[] }>(
    `${base}/me/assigned_instagram_accounts?fields=id,username&access_token=${tk}`,
  );
  if (a?.data?.[0]) return a.data[0];

  // 2) debug_token → granular_scopes.target_ids
  const d = await getJson<{ data?: { type?: string; granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
    `${base}/debug_token?input_token=${tk}&access_token=${appToken}`,
  );
  const gs = d?.data?.granular_scopes ?? [];
  for (const id of new Set(gs.filter((g) => g.scope.startsWith("instagram")).flatMap((g) => g.target_ids ?? []))) {
    const acc = await named(id);
    if (acc) return acc;
  }

  // 3) İşletme portföyündeki Instagram hesapları
  const biz = await getJson<{ data?: { id: string }[] }>(`${base}/me/businesses?fields=id&access_token=${tk}`);
  for (const bid of [...(biz?.data ?? []).map((x) => x.id), ...gs.filter((g) => g.scope === "business_management").flatMap((g) => g.target_ids ?? [])]) {
    for (const edge of ["owned_instagram_accounts", "instagram_accounts", "client_instagram_accounts"]) {
      const r = await getJson<{ data?: { id: string; username?: string }[] }>(
        `${base}/${bid}/${edge}?fields=id,username&access_token=${tk}`,
      );
      if (r?.data?.[0]) return r.data[0];
    }
  }

  // 4) Facebook sayfasına bağlı hesap (eski yol)
  const p = await getJson<{ data?: { instagram_business_account?: { id: string; username?: string } }[] }>(
    `${base}/me/accounts?fields=instagram_business_account{id,username}&access_token=${tk}`,
  );
  const viaPage = p?.data?.find((x) => x.instagram_business_account)?.instagram_business_account;
  if (viaPage) return viaPage;

  const summary = gs.map((g) => `${g.scope}${g.target_ids ? `(${g.target_ids.length})` : ""}`).join(", ") || "izin yok";
  return { error: `Instagram hesabı bulunamadı. Token: ${d?.data?.type ?? "?"} · izinler: ${summary}` };
}

/** OAuth code → token; kv'ye kaydeder. */
export async function exchangeCode(code: string, appUrl: string) {
  const redirect = `${appUrl}/api/instagram/callback`;

  if (unifiedMode()) {
    const u = new URL(`${HOSTS.fb}/oauth/access_token`);
    u.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID!);
    u.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET!);
    u.searchParams.set("redirect_uri", redirect);
    u.searchParams.set("code", code);
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`Meta token: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    const acc = await findIgAccount(j.access_token);
    if ("error" in acc) throw new Error(acc.error);
    const t: IgToken = {
      token: j.access_token,
      userId: acc.id,
      username: acc.username,
      expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : NEVER,
      obtainedAt: Date.now(),
      host: "fb",
    };
    await kvSet("ig_token", t);
    return t;
  }

  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirect,
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

  const me = await getJson<{ user_id?: string; username?: string }>(
    `${HOSTS.ig}/me?fields=user_id,username&access_token=${long.access_token}`,
  );

  const t: IgToken = {
    token: long.access_token,
    userId: String(me?.user_id ?? short.user_id),
    username: me?.username,
    expiresAt: Date.now() + long.expires_in * 1000,
    obtainedAt: Date.now(),
    host: "ig",
  };
  await kvSet("ig_token", t);
  return t;
}

/** Cron'dan çağrılır: yalnızca eski (60 günlük) token'ı yeniler; Unified login token'ı süresizdir. */
export async function refreshIgTokenIfNeeded() {
  const t = await kvGet<IgToken>("ig_token");
  if (!t) return "none";
  if (t.host === "fb") return "ok (süresiz)";
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
  const host = t.host ?? "ig";
  // graph.facebook.com'da "me" sistem kullanıcısıdır → Instagram hesap kimliğiyle değiştir
  const p = host === "fb" ? path.replace(/^me(\/|$)/, `${t.userId}$1`) : path;
  const u = new URL(`${HOSTS[host]}/${p}`);
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
