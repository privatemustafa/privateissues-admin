import "server-only";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, schema, kvGet } from "@/db";
import type { Order } from "@/db/schema";
import { dayKey, startOfTodayIstanbul, urgency, type Urgency } from "./format";

const O = schema.orders;
const live = and(eq(O.test, false), isNull(O.cancelledAt));

export async function getPending() {
  return db().select().from(O).where(eq(O.needsShipping, true)).orderBy(asc(O.createdAt));
}

export async function getPendingCount() {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(O)
    .where(eq(O.needsShipping, true));
  return r?.n ?? 0;
}

export function worstUrgency(orders: Pick<Order, "createdAt" | "shippingMethod">[]): Urgency | null {
  const rank: Urgency[] = ["fresh", "due", "late", "critical"];
  let worst = -1;
  for (const o of orders) worst = Math.max(worst, rank.indexOf(urgency(o.createdAt, o.shippingMethod)));
  return worst < 0 ? null : rank[worst];
}

export type DayPoint = { day: string; orders: number; revenue: number };

export async function getStats(days = 30) {
  const start = new Date(+startOfTodayIstanbul() - (days - 1) * 86_400_000);
  const rows = await db()
    .select({
      createdAt: O.createdAt,
      total: O.total,
      lineItems: O.lineItems,
      customerOrderCount: O.customerOrderCount,
    })
    .from(O)
    .where(and(live, gte(O.createdAt, new Date(+start - days * 86_400_000))));

  // gün gün seri (İstanbul saatine göre)
  const series = new Map<string, DayPoint>();
  for (let i = 0; i < days; i++) {
    const k = dayKey(new Date(+start + i * 86_400_000));
    series.set(k, { day: k, orders: 0, revenue: 0 });
  }
  let prevOrders = 0;
  let prevRevenue = 0;
  const products = new Map<string, { title: string; image: string | null; qty: number; revenue: number }>();
  let returning = 0;

  for (const r of rows) {
    const k = dayKey(r.createdAt);
    const p = series.get(k);
    if (p) {
      p.orders++;
      p.revenue += r.total;
      if ((r.customerOrderCount ?? 1) > 1) returning++;
      for (const li of r.lineItems) {
        const cur = products.get(li.title) ?? { title: li.title, image: li.image, qty: 0, revenue: 0 };
        cur.qty += li.quantity;
        cur.revenue += li.unitPrice * li.quantity;
        products.set(li.title, cur);
      }
    } else if (r.createdAt < start) {
      prevOrders++;
      prevRevenue += r.total;
    }
  }

  const points = [...series.values()];
  const today = points[points.length - 1];
  const yesterday = points[points.length - 2];
  const totalOrders = points.reduce((a, p) => a + p.orders, 0);
  const totalRevenue = points.reduce((a, p) => a + p.revenue, 0);
  const last7 = points.slice(-7);

  return {
    points,
    today,
    yesterday,
    week: {
      orders: last7.reduce((a, p) => a + p.orders, 0),
      revenue: last7.reduce((a, p) => a + p.revenue, 0),
    },
    period: {
      orders: totalOrders,
      revenue: totalRevenue,
      aov: totalOrders ? totalRevenue / totalOrders : 0,
      returning,
      prevOrders,
      prevRevenue,
    },
    topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
  };
}

export async function getRecentOrders(limit = 8) {
  return db().select().from(O).where(eq(O.test, false)).orderBy(desc(O.createdAt)).limit(limit);
}

export type OrderFilter = "open" | "shipped" | "all" | "cancelled";

export async function listOrders(status: OrderFilter, q?: string) {
  const conds: SQL[] = [eq(O.test, false)];
  if (status === "open") conds.push(eq(O.needsShipping, true));
  if (status === "shipped") conds.push(isNotNull(O.fulfilledAt), isNull(O.cancelledAt));
  if (status === "cancelled") conds.push(isNotNull(O.cancelledAt));
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conds.push(
      or(ilike(O.name, like), ilike(O.customerName, like), ilike(O.customerEmail, like), sql`${O.lineItems}::text ilike ${like}`)!,
    );
  }
  return db()
    .select()
    .from(O)
    .where(and(...conds))
    .orderBy(status === "open" ? asc(O.createdAt) : desc(O.createdAt))
    .limit(200);
}

export async function getCounts() {
  const [r] = await db()
    .select({
      open: sql<number>`count(*) filter (where ${O.needsShipping})::int`,
      all: sql<number>`count(*)::int`,
    })
    .from(O)
    .where(eq(O.test, false));
  return r ?? { open: 0, all: 0 };
}

export async function getOrder(id: string) {
  const [o] = await db().select().from(O).where(eq(O.id, id)).limit(1);
  if (!o) return null;
  const [note] = await db().select().from(schema.orderNotes).where(eq(schema.orderNotes.orderId, id)).limit(1);
  const history = o.customerId
    ? await db()
        .select({ id: O.id, name: O.name, total: O.total, createdAt: O.createdAt })
        .from(O)
        .where(and(eq(O.customerId, o.customerId), sql`${O.id} <> ${o.id}`))
        .orderBy(desc(O.createdAt))
        .limit(10)
    : [];
  return { order: o, note: note?.note ?? "", history };
}

export async function getSystemStatus() {
  const [lastSync, lastCron, subs, lastWebhook] = await Promise.all([
    kvGet<string>("orders_synced_at"),
    kvGet<string>("cron_last_run"),
    db().select({ n: sql<number>`count(*)::int` }).from(schema.pushSubscriptions),
    db()
      .select({ sentAt: schema.notificationLog.sentAt, title: schema.notificationLog.title })
      .from(schema.notificationLog)
      .where(eq(schema.notificationLog.kind, "webhook"))
      .orderBy(desc(schema.notificationLog.sentAt))
      .limit(1),
  ]);
  return {
    lastSync,
    lastCron,
    devices: subs[0]?.n ?? 0,
    lastWebhook: lastWebhook[0] ?? null,
  };
}

export async function getRecentNotifications(limit = 12) {
  return db()
    .select()
    .from(schema.notificationLog)
    .where(sql`${schema.notificationLog.kind} <> 'webhook' and ${schema.notificationLog.title} is not null`)
    .orderBy(desc(schema.notificationLog.sentAt))
    .limit(limit);
}

/** Instagram korelasyonu için: gün bazında sipariş sayısı */
export async function getDailyOrders(days: number) {
  const s = await getStats(days);
  return s.points;
}
