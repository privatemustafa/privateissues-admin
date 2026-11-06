import "server-only";
import { desc, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type Hit = { kind: "order" | "product" | "note" | "pr" | "expense" | "page"; title: string; sub?: string; href: string };

const PAGES: Hit[] = [
  { kind: "page", title: "Panel", href: "/" },
  { kind: "page", title: "Siparişler", href: "/orders" },
  { kind: "page", title: "Paketleme", href: "/pack" },
  { kind: "page", title: "Depo", href: "/depo" },
  { kind: "page", title: "Shopify stok", href: "/stock" },
  { kind: "page", title: "Instagram", href: "/instagram" },
  { kind: "page", title: "PR", href: "/pr" },
  { kind: "page", title: "Notlar", href: "/notlar" },
  { kind: "page", title: "Giderler", href: "/giderler" },
  { kind: "page", title: "İndirim kodları", href: "/kodlar" },
  { kind: "page", title: "Reklam", href: "/reklam" },
  { kind: "page", title: "Ayarlar", href: "/settings" },
];

export async function search(qRaw: string): Promise<Hit[]> {
  const q = qRaw.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const lc = q.toLocaleLowerCase("tr");
  const [orders, items, notes, people, exps] = await Promise.all([
    db()
      .select({ id: schema.orders.id, name: schema.orders.name, customer: schema.orders.customerName, total: schema.orders.total, city: schema.orders.shippingAddress })
      .from(schema.orders)
      .where(
        or(
          ilike(schema.orders.name, like),
          ilike(schema.orders.customerName, like),
          ilike(schema.orders.customerEmail, like),
          sql`${schema.orders.lineItems}::text ilike ${like}`,
          sql`${schema.orders.discountCodes}::text ilike ${like}`,
        ),
      )
      .orderBy(desc(schema.orders.createdAt))
      .limit(8),
    db()
      .select({ id: schema.warehouseItems.id, product: schema.warehouseItems.product, variant: schema.warehouseItems.variant, qty: schema.warehouseItems.qty })
      .from(schema.warehouseItems)
      .where(or(ilike(schema.warehouseItems.product, like), ilike(schema.warehouseItems.sku, like)))
      .limit(6),
    db()
      .select({ id: schema.notes.id, title: schema.notes.title, items: schema.notes.items })
      .from(schema.notes)
      .where(or(ilike(schema.notes.title, like), ilike(schema.notes.body, like), sql`${schema.notes.items}::text ilike ${like}`))
      .limit(5),
    db()
      .select({ handle: schema.prPeople.handle, name: schema.prPeople.name, code: schema.prPeople.code })
      .from(schema.prPeople)
      .where(or(ilike(schema.prPeople.handle, like), ilike(schema.prPeople.name, like), ilike(schema.prPeople.code, like)))
      .limit(5),
    db()
      .select({ id: schema.expenses.id, title: schema.expenses.title, amount: schema.expenses.amount, vendor: schema.expenses.vendor })
      .from(schema.expenses)
      .where(or(ilike(schema.expenses.title, like), ilike(schema.expenses.vendor, like), ilike(schema.expenses.note, like)))
      .limit(5),
  ]);
  const hits: Hit[] = [
    ...PAGES.filter((p) => p.title.toLocaleLowerCase("tr").includes(lc)),
    ...orders.map((o) => ({
      kind: "order" as const,
      title: `${o.name} · ${o.customer ?? "—"}`,
      sub: `₺${o.total.toLocaleString("tr-TR")}${o.city?.city ? ` · ${o.city.city}` : ""}`,
      href: `/orders/${o.id}`,
    })),
    ...items.map((i) => ({ kind: "product" as const, title: `${i.product}${i.variant ? ` · ${i.variant}` : ""}`, sub: `${i.qty} adet depoda`, href: "/depo" })),
    ...people.map((p) => ({ kind: "pr" as const, title: `@${p.handle}`, sub: [p.name, p.code].filter(Boolean).join(" · "), href: "/pr" })),
    ...notes.map((n) => ({ kind: "note" as const, title: n.title, sub: `${n.items.filter((i) => i.done).length}/${n.items.length}`, href: "/notlar" })),
    ...exps.map((e) => ({ kind: "expense" as const, title: e.title, sub: `₺${e.amount.toLocaleString("tr-TR")}${e.vendor ? ` · ${e.vendor}` : ""}`, href: "/giderler" })),
  ];
  return hits.slice(0, 20);
}
