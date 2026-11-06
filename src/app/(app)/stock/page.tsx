import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { getInventory } from "@/lib/shopify/actions";
import { getSettings } from "@/lib/settings";
import { getStats } from "@/lib/data";
import { Card, Eyebrow, PageHeader, Skeleton, cx } from "@/components/ui";
import { StockBoard } from "@/components/stock-board";

export const metadata = { title: "Shopify stok" };

export default function StockPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Shopify stok" sub="Sitede görünen adetler. Bedene dokun, adedi buradan değiştir." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireSession();
  const [products, settings, stats] = await Promise.all([
    getInventory().catch((e: unknown) => e as Error),
    getSettings(),
    getStats(30),
  ]);
  if (products instanceof Error) {
    return (
      <Card className="p-6">
        <p className="font-medium">Shopify&apos;a bağlanılamadı</p>
        <p className="mt-1 text-[13px] text-mute">{products.message}</p>
      </Card>
    );
  }

  const low = settings.lowStock;
  const sold = Object.fromEntries(stats.topProducts.map((p) => [p.title, p.qty]));
  const lowCount = products.reduce((s, p) => s + p.variants.filter((v) => v.qty <= low).length, 0);
  const totalUnits = products.reduce((s, p) => s + p.variants.reduce((a, v) => a + Math.max(0, v.qty), 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <Eyebrow>Ürün</Eyebrow>
          <p className="num mt-2 text-[26px] leading-none font-medium">{products.length}</p>
        </Card>
        <Card className="p-4">
          <Eyebrow>Toplam adet</Eyebrow>
          <p className="num mt-2 text-[26px] leading-none font-medium">{totalUnits}</p>
        </Card>
        <Card className={cx("p-4", lowCount > 0 && "border-late/30")}>
          <Eyebrow>Azalan beden</Eyebrow>
          <p className={cx("num mt-2 text-[26px] leading-none font-medium", lowCount > 0 && "text-late")}>{lowCount}</p>
        </Card>
      </div>
      <StockBoard products={products} low={low} sold={sold} />
    </div>
  );
}
