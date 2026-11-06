import "server-only";
import { shopifyGraphQL, ShopifyError } from "./client";
import {
  FULFILLMENT_CREATE,
  FULFILLMENT_ORDERS_QUERY,
  INVENTORY_QUERY,
  ORDER_NOTE_UPDATE,
  WEBHOOKS_QUERY,
  WEBHOOK_CREATE,
  WEBHOOK_DELETE,
} from "./queries";
import { syncOrder } from "./sync";

type UserError = { field: string[] | null; message: string };

export const CARRIERS = [
  "Yurtiçi Kargo",
  "Aras Kargo",
  "MNG Kargo",
  "PTT Kargo",
  "Sürat Kargo",
  "HepsiJET",
  "Kolay Gelsin",
  "Trendyol Express",
  "Elden teslim",
] as const;

export async function fulfillOrder(input: {
  orderId: string;
  company?: string;
  trackingNumber?: string;
  notifyCustomer: boolean;
}) {
  const data = await shopifyGraphQL<{
    order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null;
  }>(FULFILLMENT_ORDERS_QUERY, { id: input.orderId });

  const open = (data.order?.fulfillmentOrders.nodes ?? []).filter((f) =>
    ["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(f.status),
  );
  if (!open.length) throw new ShopifyError("Kargolanacak açık kalem yok (zaten kargolanmış olabilir).");

  const tracking =
    input.trackingNumber || input.company
      ? {
          company: input.company && input.company !== "Elden teslim" ? input.company : undefined,
          number: input.trackingNumber || undefined,
        }
      : undefined;

  const res = await shopifyGraphQL<{
    fulfillmentCreate: { fulfillment: { id: string } | null; userErrors: UserError[] };
  }>(FULFILLMENT_CREATE, {
    fulfillment: {
      lineItemsByFulfillmentOrder: open.map((f) => ({ fulfillmentOrderId: f.id })),
      notifyCustomer: input.notifyCustomer,
      trackingInfo: tracking,
    },
  });
  const errs = res.fulfillmentCreate.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join(", "));

  return syncOrder(input.orderId);
}

export async function updateShopifyNote(orderId: string, note: string) {
  const res = await shopifyGraphQL<{ orderUpdate: { userErrors: UserError[] } }>(ORDER_NOTE_UPDATE, {
    input: { id: orderId, note },
  });
  if (res.orderUpdate.userErrors.length) {
    throw new ShopifyError(res.orderUpdate.userErrors.map((e) => e.message).join(", "));
  }
}

// --- Webhooks ---------------------------------------------------------------

export const WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_FULFILLED",
  "REFUNDS_CREATE",
] as const;

export async function listWebhooks() {
  const d = await shopifyGraphQL<{
    webhookSubscriptions: { nodes: { id: string; topic: string; uri: string }[] };
  }>(WEBHOOKS_QUERY);
  return d.webhookSubscriptions.nodes;
}

/** Webhook'ları APP_URL'e göre kurar; eski/yanlış adresleri siler. */
export async function registerWebhooks(appUrl: string) {
  const uri = `${appUrl.replace(/\/$/, "")}/api/webhooks/shopify`;
  const existing = await listWebhooks();
  const result: string[] = [];

  for (const w of existing) {
    if (w.uri !== uri) {
      await shopifyGraphQL(WEBHOOK_DELETE, { id: w.id });
      result.push(`silindi: ${w.topic}`);
    }
  }
  const have = new Set(existing.filter((w) => w.uri === uri).map((w) => w.topic));
  for (const topic of WEBHOOK_TOPICS) {
    if (have.has(topic)) continue;
    const r = await shopifyGraphQL<{
      webhookSubscriptionCreate: { userErrors: UserError[] };
    }>(WEBHOOK_CREATE, { topic, uri });
    const errs = r.webhookSubscriptionCreate.userErrors;
    result.push(errs.length ? `${topic}: ${errs.map((e) => e.message).join(", ")}` : `kuruldu: ${topic}`);
  }
  return result;
}

// --- Stok -------------------------------------------------------------------

export type StockProduct = {
  id: string;
  title: string;
  image: string | null;
  total: number;
  variants: { id: string; title: string; qty: number }[];
};

export async function getInventory(): Promise<StockProduct[]> {
  const out: StockProduct[] = [];
  let after: string | null = null;
  do {
    const d: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string };
        nodes: {
          id: string;
          title: string;
          totalInventory: number;
          featuredMedia: { preview: { image: { url: string } | null } | null } | null;
          variants: { nodes: { id: string; title: string; inventoryQuantity: number | null }[] };
        }[];
      };
    } = await shopifyGraphQL(INVENTORY_QUERY, { after });
    for (const p of d.products.nodes) {
      out.push({
        id: p.id,
        title: p.title,
        image: p.featuredMedia?.preview?.image?.url ?? null,
        total: p.totalInventory,
        variants: p.variants.nodes.map((v) => ({
          id: v.id,
          title: v.title === "Default Title" ? "Tek beden" : v.title,
          qty: v.inventoryQuantity ?? 0,
        })),
      });
    }
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}
