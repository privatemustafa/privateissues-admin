import { after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "@/db";
import { syncOrder } from "@/lib/shopify/sync";
import { notifyCancelled, notifyNewOrder, checkLowStock } from "@/lib/notify";
import { getSettings } from "@/lib/settings";

function verify(raw: string, hmacHeader: string | null) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = createHmac("sha256", secret).update(raw, "utf8").digest();
  const given = Buffer.from(hmacHeader, "base64");
  return given.length === digest.length && timingSafeEqual(given, digest);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verify(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return new Response("invalid hmac", { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? crypto.randomUUID();
  const payload = JSON.parse(raw) as { admin_graphql_api_id?: string; order_id?: number };

  // Shopify 5 sn içinde 200 bekler → işi cevaptan sonra yap
  after(async () => {
    // aynı webhook iki kez gelirse bir kez işle
    const fresh = await db()
      .insert(schema.notificationLog)
      .values({ kind: "webhook", ref: webhookId, title: topic })
      .onConflictDoNothing()
      .returning({ id: schema.notificationLog.id });
    if (!fresh.length) return;

    const orderId =
      topic === "refunds/create"
        ? payload.order_id
          ? `gid://shopify/Order/${payload.order_id}`
          : null
        : (payload.admin_graphql_api_id ?? null);
    if (!orderId) return;

    const order = await syncOrder(orderId);
    if (!order) return;

    if (topic === "orders/create") {
      await notifyNewOrder(order);
    } else if (topic === "orders/cancelled") {
      await notifyCancelled(order);
    } else if (topic === "orders/updated") {
      const s = await getSettings();
      await checkLowStock(order.lineItems ?? [], s.lowStock);
    }
  });

  return new Response("ok");
}
