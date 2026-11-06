import "server-only";
import { cacheLife } from "next/cache";
import { kvGet, kvSet } from "@/db";
import { getIgToken } from "./instagram";

/**
 * Meta reklam verisi (Marketing API). Instagram bağlantısındaki sistem-kullanıcı token'ı kullanılır;
 * giriş yapılandırmasında ads_read izni ve reklam hesabı varlığı seçili olmalı.
 */
const FB = "https://graph.facebook.com/v24.0";

async function fb<T>(path: string, params: Record<string, string>): Promise<T> {
  const t = await getIgToken();
  if (!t || t.host !== "fb") throw new Error("Meta bağlantısı yok");
  const u = new URL(`${FB}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", t.token);
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) throw new Error(`Meta ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export type AdAccount = { id: string; name: string; currency: string; status: number };

/** Token'ın görebildiği reklam hesapları. */
export async function listAdAccounts(): Promise<AdAccount[]> {
  const r = await fb<{ data: { id: string; name: string; currency: string; account_status: number }[] }>("me/adaccounts", {
    fields: "id,name,currency,account_status",
    limit: "25",
  }).catch(() => null);
  return (r?.data ?? []).map((a) => ({ id: a.id, name: a.name, currency: a.currency, status: a.account_status }));
}

export async function getAdAccountId() {
  const saved = process.env.META_AD_ACCOUNT_ID || (await kvGet<string>("ad_account_id"));
  if (saved) return saved.startsWith("act_") ? saved : `act_${saved}`;
  const list = await listAdAccounts();
  if (list[0]) {
    await kvSet("ad_account_id", list[0].id);
    return list[0].id;
  }
  return null;
}

export async function setAdAccountId(id: string) {
  await kvSet("ad_account_id", id);
}

type Action = { action_type: string; value: string };
type Insight = {
  date_start?: string;
  campaign_name?: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpc?: string;
  ctr?: string;
  actions?: Action[];
  action_values?: Action[];
  purchase_roas?: { action_type: string; value: string }[];
};

const num = (s?: string) => (s ? Number(s) : 0);
const act = (xs: Action[] | undefined, type: string) => num(xs?.find((a) => a.action_type === type)?.value);

export type AdDay = { day: string; spend: number; purchases: number; purchaseValue: number; clicks: number; reach: number };
export type AdCampaign = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  addToCart: number;
  landingViews: number;
};

function shape(i: Insight) {
  return {
    spend: num(i.spend),
    impressions: num(i.impressions),
    reach: num(i.reach),
    clicks: num(i.clicks),
    ctr: num(i.ctr),
    cpc: num(i.cpc),
    purchases: act(i.actions, "purchase") || act(i.actions, "omni_purchase") || act(i.actions, "offsite_conversion.fb_pixel_purchase"),
    purchaseValue:
      act(i.action_values, "purchase") || act(i.action_values, "omni_purchase") || act(i.action_values, "offsite_conversion.fb_pixel_purchase"),
    addToCart: act(i.actions, "add_to_cart") || act(i.actions, "omni_add_to_cart"),
    landingViews: act(i.actions, "landing_page_view"),
  };
}

const FIELDS = "spend,impressions,reach,clicks,cpc,ctr,actions,action_values,purchase_roas";

export async function adsOverview(days = 30): Promise<{ account: string; daily: AdDay[]; campaigns: AdCampaign[]; totals: ReturnType<typeof shape> } | null> {
  "use cache";
  cacheLife("hours");
  const acct = await getAdAccountId();
  if (!acct) return null;
  const until = new Date();
  const since = new Date(+until - days * 86_400_000);
  const range = JSON.stringify({ since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) });

  const [daily, camp] = await Promise.all([
    fb<{ data: Insight[] }>(`${acct}/insights`, { fields: "spend,reach,clicks,actions,action_values", time_range: range, time_increment: "1", limit: "100" }),
    fb<{ data: Insight[] }>(`${acct}/insights`, { fields: `campaign_id,campaign_name,${FIELDS}`, time_range: range, level: "campaign", limit: "100" }),
  ]);

  const campaigns: AdCampaign[] = camp.data
    .map((i) => {
      const s = shape(i);
      return { id: i.campaign_id ?? "", name: i.campaign_name ?? "Kampanya", ...s, roas: s.spend ? s.purchaseValue / s.spend : 0 };
    })
    .sort((a, b) => b.spend - a.spend);
  const totals = campaigns.reduce(
    (a, c) => ({
      spend: a.spend + c.spend,
      impressions: a.impressions + c.impressions,
      reach: a.reach + c.reach,
      clicks: a.clicks + c.clicks,
      ctr: 0,
      cpc: 0,
      purchases: a.purchases + c.purchases,
      purchaseValue: a.purchaseValue + c.purchaseValue,
      addToCart: a.addToCart + c.addToCart,
      landingViews: a.landingViews + c.landingViews,
    }),
    shape({}),
  );
  totals.ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks ? totals.spend / totals.clicks : 0;

  return {
    account: acct,
    daily: daily.data.map((i) => {
      const s = shape(i);
      return { day: i.date_start ?? "", spend: s.spend, purchases: s.purchases, purchaseValue: s.purchaseValue, clicks: s.clicks, reach: s.reach };
    }),
    campaigns,
    totals,
  };
}

/** Kâr hesabı için: aralıktaki toplam harcama (TL). */
export async function adSpendBetween(from: Date, to: Date): Promise<number | null> {
  const acct = await getAdAccountId().catch(() => null);
  if (!acct) return null;
  const range = JSON.stringify({ since: from.toISOString().slice(0, 10), until: new Date(+to - 1).toISOString().slice(0, 10) });
  const r = await fb<{ data: Insight[] }>(`${acct}/insights`, { fields: "spend", time_range: range }).catch(() => null);
  return r ? num(r.data[0]?.spend) : null;
}
