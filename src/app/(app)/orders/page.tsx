import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { PageHeader, Skeleton } from "@/components/ui";
import { OrderList, type OrdersSearch } from "./list";

export const metadata = { title: "Siparişler" };

async function Content({ searchParams }: { searchParams: Promise<OrdersSearch> }) {
  await requireSession();
  return <OrderList search={await searchParams} />;
}

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Siparişler" />
      <div className="md:grid md:grid-cols-[minmax(300px,360px)_1fr] md:gap-5 lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Content searchParams={searchParams as Promise<OrdersSearch>} />
        </Suspense>
        {/* Fold açıkken sağ panel */}
        <div className="hidden md:block">
          <div className="sticky top-6 flex h-[60vh] items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line text-[14px] text-faint">
            Soldan bir sipariş seç
          </div>
        </div>
      </div>
    </div>
  );
}
