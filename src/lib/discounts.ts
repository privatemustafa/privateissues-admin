import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { shopifyGraphQL } from "./shopify/client";
import { DISCOUNTS_QUERY } from "./shopify/queries";

type Node = {
  id: string;
  discount: {
    __typename: string;
    title?: string;
    status?: "ACTIVE" | "EXPIRED" | "SCHEDULED";
    asyncUsageCount?: number;
    usageLimit?: number | null;
    startsAt?: string;
    endsAt?: string | null;
    summary?: string;
    codes?: { nodes: { code: string }[] };
    customerGets?: { value: { __typename: string; percentage?: number; amount?: { amount: string } } };
  };
};

export type DiscountRow = {
  id: string;
  title: string;
  codes: string[];
  automatic: boolean;
  status: "ACTIVE" | "EXPIRED" | "SCHEDULED";
  used: number;
  limit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  summary: string;
  value: string;
  /** Panelde görülen siparişlerden (son 60 gün) */
  orders: number;
  revenue: number;
  /** PR kişisine bağlıysa */
  prHandle: string | null;
};

async function fetchDiscounts(): Promise<Node[]> {
  const out: Node[] = [];
  let after: string | null = null;
  do {
    const d: { discountNodes: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Node[] } } = await shopifyGraphQL(
      DISCOUNTS_QUERY,
      { after },
    );
    out.push(...d.discountNodes.nodes);
    after = d.discountNodes.pageInfo.hasNextPage ? d.discountNodes.pageInfo.endCursor : null;
  } while (after);
  return out;
}

export async function listDiscounts(): Promise<DiscountRow[]> {
  const [nodes, orders, pr] = await Promise.all([
    fetchDiscounts(),
    db()
      .select({ codes: schema.orders.discountCodes, total: schema.orders.total })
      .from(schema.orders)
      .where(and(eq(schema.orders.test, false), isNull(schema.orders.cancelledAt), sql`jsonb_array_length(${schema.orders.discountCodes}) > 0`)),
    db().select({ handle: schema.prPeople.handle, code: schema.prPeople.code }).from(schema.prPeople),
  ]);
  const byCode = new Map<string, { n: number; rev: number }>();
  for (const o of orders)
    for (const c of o.codes) {
      const k = c.toUpperCase();
      const cur = byCode.get(k) ?? { n: 0, rev: 0 };
      cur.n++;
      cur.rev += o.total;
      byCode.set(k, cur);
    }
  const prByCode = new Map(pr.filter((p) => p.code).map((p) => [p.code!.toUpperCase(), p.handle]));

  return nodes
    .filter((n) => n.discount.title)
    .map((n) => {
      const d = n.discount;
      const codes = d.codes?.nodes.map((c) => c.code) ?? [];
      const stat = codes.reduce(
        (a, c) => {
          const s = byCode.get(c.toUpperCase());
          return s ? { n: a.n + s.n, rev: a.rev + s.rev } : a;
        },
        { n: 0, rev: 0 },
      );
      const v = d.customerGets?.value;
      const value =
        v?.__typename === "DiscountPercentage" && v.percentage != null
          ? `%${Math.round(v.percentage * 100)}`
          : v?.__typename === "DiscountAmount" && v.amount
            ? `₺${Number(v.amount.amount).toLocaleString("tr-TR")}`
            : d.__typename.includes("FreeShipping")
              ? "Ücretsiz kargo"
              : d.__typename.includes("Bxgy")
                ? "Al-kazan"
                : "";
      return {
        id: n.id,
        title: d.title!,
        codes,
        automatic: d.__typename.startsWith("DiscountAutomatic"),
        status: d.status ?? "ACTIVE",
        used: d.asyncUsageCount ?? 0,
        limit: d.usageLimit ?? null,
        startsAt: d.startsAt ?? null,
        endsAt: d.endsAt ?? null,
        summary: d.summary ?? "",
        value,
        orders: stat.n,
        revenue: stat.rev,
        prHandle: codes.map((c) => prByCode.get(c.toUpperCase())).find(Boolean) ?? null,
      };
    })
    .sort((a, b) => (a.status === "ACTIVE" ? 0 : 1) - (b.status === "ACTIVE" ? 0 : 1) || b.used - a.used);
}
