import { Suspense } from "react";
import { inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { getPending } from "@/lib/data";
import { CARRIERS } from "@/lib/carriers";
import { itemImages, shipSummary } from "@/lib/ship";
import { ago } from "@/lib/format";
import { PageHeader, Skeleton } from "@/components/ui";
import { PackBoard, type PackOrder, type PickLine } from "@/components/pack-board";

export const metadata = { title: "Paketleme" };

export default function PackPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Paketleme" sub="Önce raftan topla, sonra paket paket kargola." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireSession();
  const pending = await getPending();
  const notes = pending.length
    ? await db().select().from(schema.orderNotes).where(inArray(schema.orderNotes.orderId, pending.map((o) => o.id)))
    : [];
  const noteMap = new Map(notes.map((n) => [n.orderId, n.note]));

  // Aynı ürün + beden tek satırda toplanır
  const picks = new Map<string, PickLine>();
  for (const o of pending) {
    for (const li of o.lineItems) {
      const key = `${li.title}|${li.variantTitle ?? ""}`;
      const cur = picks.get(key) ?? {
        key,
        title: li.title,
        variant: li.variantTitle,
        images: itemImages(li),
        qty: 0,
        orders: [],
      };
      cur.qty += li.quantity;
      if (!cur.orders.includes(o.name)) cur.orders.push(o.name);
      picks.set(key, cur);
    }
  }

  const orders: PackOrder[] = pending.map((o) => ({
    ...shipSummary(o),
    age: ago(o.createdAt),
    note: o.note,
    myNote: noteMap.get(o.id) || null,
  }));

  const sortedPicks = [...picks.values()].sort((a, b) => a.title.localeCompare(b.title) || (a.variant ?? "").localeCompare(b.variant ?? ""));

  return <PackBoard picks={sortedPicks} orders={orders} carriers={CARRIERS} />;
}
