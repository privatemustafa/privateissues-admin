import Link from "next/link";
import { getCounts, listOrders, type OrderFilter } from "@/lib/data";
import { Card, EmptyState, cx } from "@/components/ui";
import { OrderRow } from "@/components/orders";

export type OrdersSearch = { status?: string; q?: string };

export function parseFilter(s?: string): OrderFilter {
  return s === "shipped" || s === "all" || s === "cancelled" ? s : "open";
}

export async function OrderList({ search, activeId }: { search: OrdersSearch; activeId?: string }) {
  const status = parseFilter(search.status);
  const [orders, counts] = await Promise.all([listOrders(status, search.q), getCounts()]);
  const qs = (s: OrderFilter) => `/orders?status=${s}${search.q ? `&q=${encodeURIComponent(search.q)}` : ""}`;

  const tabs: { key: OrderFilter; label: string; n?: number }[] = [
    { key: "open", label: "Kargolanacak", n: counts.open },
    { key: "shipped", label: "Kargolanan" },
    { key: "all", label: "Tümü", n: counts.all },
    { key: "cancelled", label: "İptal" },
  ];

  return (
    <div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={qs(t.key)}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] transition",
              status === t.key ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-2",
            )}
          >
            {t.label}
            {t.n != null && (
              <span className={cx("num text-[12px]", status === t.key ? "text-paper/60" : "text-faint")}>{t.n}</span>
            )}
          </Link>
        ))}
      </div>

      <form action="/orders" className="mb-3">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={search.q}
          placeholder="Sipariş no, müşteri, ürün ara…"
          className="h-11 w-full rounded-2xl border border-line bg-card px-4 text-[15px] outline-none focus:border-ink"
        />
      </form>

      <Card className="overflow-hidden">
        {orders.length ? (
          <div className="divide-y divide-line">
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                o={o}
                active={o.id === activeId}
                href={`/orders/${encodeURIComponent(o.id)}?status=${status}${search.q ? `&q=${encodeURIComponent(search.q)}` : ""}`}
              />
            ))}
          </div>
        ) : status === "open" ? (
          <EmptyState title="Kargolanacak paket yok" sub="Temiz. Yeni sipariş gelince bildirim alacaksın." />
        ) : (
          <EmptyState title="Sonuç yok" />
        )}
      </Card>
    </div>
  );
}
