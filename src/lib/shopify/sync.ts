import "server-only";
import { db, schema, kvGet, kvSet } from "@/db";
import type { LineItem, NewOrder } from "@/db/schema";
import { shopifyGraphQL } from "./client";
import { ORDERS_QUERY, ORDER_QUERY } from "./queries";

type Money = { shopMoney: { amount: string; currencyCode?: string } };

export type ShopifyOrderNode = {
  id: string;
  name: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  totalPriceSet: Money;
  subtotalLineItemsQuantity: number;
  email: string | null;
  phone: string | null;
  note: string | null;
  tags: string[];
  discountCodes: string[];
  customer: { id: string; displayName: string; numberOfOrders: string } | null;
  shippingAddress: {
    name: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    phone: string | null;
  } | null;
  shippingLine: { title: string } | null;
  lineItems: {
    nodes: {
      title: string;
      variantTitle: string | null;
      quantity: number;
      sku: string | null;
      originalUnitPriceSet: Money;
      image: { url: string } | null;
      variant: { id: string; inventoryQuantity: number | null } | null;
    }[];
  };
  fulfillments: {
    createdAt: string;
    status: string;
    trackingInfo: { company: string | null; number: string | null; url: string | null }[];
  }[];
};

const OPEN_FULFILLMENT = new Set([
  "UNFULFILLED",
  "PARTIALLY_FULFILLED",
  "IN_PROGRESS",
  "OPEN",
  "PENDING_FULFILLMENT",
  "ON_HOLD",
  "SCHEDULED",
]);
const DEAD_FINANCIAL = new Set(["REFUNDED", "VOIDED", "EXPIRED"]);

export function mapOrder(n: ShopifyOrderNode): NewOrder {
  const lineItems: LineItem[] = n.lineItems.nodes.map((li) => ({
    title: li.title,
    variantTitle: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
    quantity: li.quantity,
    sku: li.sku,
    unitPrice: Number(li.originalUnitPriceSet.shopMoney.amount),
    image: li.image?.url ?? null,
    variantId: li.variant?.id ?? null,
    inventoryQuantity: li.variant?.inventoryQuantity ?? null,
  }));

  const successful = n.fulfillments.filter((f) => f.status === "SUCCESS");
  const fulfilledAt = successful.length
    ? new Date(Math.max(...successful.map((f) => +new Date(f.createdAt))))
    : null;

  const needsShipping =
    !n.cancelledAt &&
    !n.test &&
    OPEN_FULFILLMENT.has(n.displayFulfillmentStatus) &&
    !DEAD_FINANCIAL.has(n.displayFinancialStatus ?? "");

  return {
    id: n.id,
    number: n.number,
    name: n.name,
    createdAt: new Date(n.createdAt),
    updatedAt: new Date(n.updatedAt),
    cancelledAt: n.cancelledAt ? new Date(n.cancelledAt) : null,
    fulfilledAt,
    financialStatus: n.displayFinancialStatus,
    fulfillmentStatus: n.displayFulfillmentStatus,
    needsShipping,
    total: Number(n.totalPriceSet.shopMoney.amount),
    currency: n.totalPriceSet.shopMoney.currencyCode ?? "TRY",
    itemCount: n.subtotalLineItemsQuantity,
    customerId: n.customer?.id ?? null,
    customerName: n.customer?.displayName ?? n.shippingAddress?.name ?? null,
    customerEmail: n.email,
    customerPhone: n.phone ?? n.shippingAddress?.phone ?? null,
    customerOrderCount: n.customer ? Number(n.customer.numberOfOrders) : null,
    shippingMethod: n.shippingLine?.title ?? null,
    shippingAddress: n.shippingAddress,
    lineItems,
    tracking: n.fulfillments.flatMap((f) => f.trackingInfo),
    tags: n.tags,
    discountCodes: n.discountCodes,
    note: n.note,
    test: n.test,
    syncedAt: new Date(),
  };
}

export async function upsertOrders(nodes: ShopifyOrderNode[]) {
  if (!nodes.length) return [];
  const rows = nodes.map(mapOrder);
  for (const row of rows) {
    const rest: Partial<NewOrder> = { ...row };
    delete rest.id;
    await db()
      .insert(schema.orders)
      .values(row)
      .onConflictDoUpdate({ target: schema.orders.id, set: rest });
  }
  return rows;
}

/** Tek siparişi Shopify'dan taze çekip kaydeder. */
export async function syncOrder(id: string) {
  const data = await shopifyGraphQL<{ order: ShopifyOrderNode | null }>(ORDER_QUERY, { id });
  if (!data.order) return null;
  const [row] = await upsertOrders([data.order]);
  return row;
}

/**
 * Siparişleri senkronize eder.
 * full=true → tüm geçmiş; aksi halde son senkrondan beri güncellenenler.
 */
export async function syncOrders({ full = false }: { full?: boolean } = {}) {
  const last = full ? null : await kvGet<string>("orders_synced_at");
  const since = last ? new Date(+new Date(last) - 60 * 60_000).toISOString() : null;
  const query = since ? `updated_at:>='${since}'` : null;

  let after: string | null = null;
  let count = 0;
  const startedAt = new Date().toISOString();
  do {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ShopifyOrderNode[] };
    } = await shopifyGraphQL(ORDERS_QUERY, { first: 100, after, query });
    await upsertOrders(data.orders.nodes);
    count += data.orders.nodes.length;
    after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (after);

  await kvSet("orders_synced_at", startedAt);
  return { count };
}
