import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ExpenseCategory } from "@/db/schema";
import { dayKey } from "./format";

const E = schema.expenses;

export async function addExpense(input: { date: Date; category: ExpenseCategory; title: string; amount: number; vendor?: string | null; drop?: string | null; note?: string | null }) {
  const [row] = await db().insert(E).values({ ...input, vendor: input.vendor || null, drop: input.drop || null, note: input.note || null }).returning();
  return row;
}

export async function updateExpense(id: number, patch: Partial<{ date: Date; category: ExpenseCategory; title: string; amount: number; vendor: string | null; drop: string | null; note: string | null }>) {
  await db().update(E).set(patch).where(eq(E.id, id));
}

export async function deleteExpense(id: number) {
  await db().delete(E).where(eq(E.id, id));
}

export async function listExpenses(days = 365) {
  return db()
    .select()
    .from(E)
    .where(gte(E.date, new Date(Date.now() - days * 86_400_000)))
    .orderBy(desc(E.date), desc(E.id));
}

/** Aylık toplamlar + kategori dağılımı (son N ay). */
export async function expenseSummary(months = 6) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (months - 1));
  const rows = await db().select().from(E).where(gte(E.date, start));
  const byMonth = new Map<string, number>();
  const byCat = new Map<string, number>();
  const byDrop = new Map<string, number>();
  for (const r of rows) {
    const m = dayKey(r.date).slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + r.amount);
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
    if (r.drop) byDrop.set(r.drop, (byDrop.get(r.drop) ?? 0) + r.amount);
  }
  return {
    total: rows.reduce((s, r) => s + r.amount, 0),
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value })),
    byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, value })),
    byDrop: [...byDrop.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, value })),
  };
}

/** Belirli aralıkta toplam gider (kâr hesabı için). */
export async function expensesBetween(from: Date, to: Date, category?: ExpenseCategory) {
  const [r] = await db()
    .select({ total: sql<number>`coalesce(sum(${E.amount}),0)::float` })
    .from(E)
    .where(and(gte(E.date, from), lt(E.date, to), ...(category ? [eq(E.category, category)] : [])));
  return r?.total ?? 0;
}

export async function knownDrops() {
  const rows = await db().selectDistinct({ drop: E.drop }).from(E);
  return rows.map((r) => r.drop).filter((d): d is string => !!d).sort();
}
