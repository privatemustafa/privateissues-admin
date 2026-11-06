import "server-only";
import { kvGet, kvSet } from "@/db";

export const SHOPIFY_API_VERSION = "2026-10";

function store() {
  const s = process.env.SHOPIFY_STORE;
  if (!s) throw new Error("SHOPIFY_STORE tanımlı değil");
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

type CachedToken = { token: string; expiresAt: number };
let memToken: CachedToken | null = null;

/**
 * Dev Dashboard uygulamaları kalıcı shpat_ token vermiyor.
 * Client credentials grant ile ~24 saatlik token alıp DB'de cache'liyoruz.
 * (SHOPIFY_ACCESS_TOKEN verilirse onu kullanır — eski tip custom app için.)
 */
export async function getAccessToken(force = false): Promise<string> {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;

  const now = Date.now();
  if (!force && memToken && memToken.expiresAt - 5 * 60_000 > now) return memToken.token;

  if (!force) {
    const cached = await kvGet<CachedToken>("shopify_token");
    if (cached && cached.expiresAt - 5 * 60_000 > now) {
      memToken = cached;
      return cached.token;
    }
  }

  const id = process.env.SHOPIFY_CLIENT_ID;
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET eksik");

  const res = await fetch(`https://${store()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Shopify token alınamadı (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const t: CachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 86_399) * 1000,
  };
  memToken = t;
  await kvSet("shopify_token", t);
  return t.token;
}

export class ShopifyError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

export async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  retry = true,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://${store()}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (res.status === 401 && retry && !process.env.SHOPIFY_ACCESS_TOKEN) {
    await getAccessToken(true);
    return shopifyGraphQL<T>(query, variables, false);
  }
  if (res.status === 429 && retry) {
    await new Promise((r) => setTimeout(r, 1500));
    return shopifyGraphQL<T>(query, variables, false);
  }
  if (!res.ok) throw new ShopifyError(`Shopify ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    const list = Array.isArray(json.errors) ? (json.errors as { message?: string }[]) : [];
    const msg = list.map((e) => e.message).filter(Boolean).slice(0, 2).join(" · ") || JSON.stringify(json.errors).slice(0, 200);
    throw new ShopifyError(`Shopify GraphQL hatası: ${msg}`, json.errors);
  }
  return json.data as T;
}

export function storeAdminUrl(path = "") {
  const handle = store().replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${handle}${path}`;
}

export function legacyId(gid: string) {
  return gid.split("/").pop()!;
}
