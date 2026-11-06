import { connection } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Uygulama açıkken 20 sn'de bir yoklanır: yeni sipariş var mı? */
export async function GET() {
  await connection();
  const [latest] = await db()
    .select({
      id: schema.orders.id,
      name: schema.orders.name,
      total: schema.orders.total,
      customerName: schema.orders.customerName,
      lineItems: schema.orders.lineItems,
      createdAt: schema.orders.createdAt,
    })
    .from(schema.orders)
    .orderBy(desc(schema.orders.createdAt))
    .limit(1);
  const [p] = await db()
    .select({ n: count() })
    .from(schema.orders)
    .where(eq(schema.orders.needsShipping, true));

  return Response.json(
    {
      latest: latest
        ? {
            id: latest.id,
            name: latest.name,
            total: latest.total,
            customerName: latest.customerName,
            image: latest.lineItems.find((l) => l.image)?.image ?? null,
            title: latest.lineItems[0]?.title ?? null,
          }
        : null,
      pending: p?.n ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
