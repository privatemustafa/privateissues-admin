import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { getInventory } from "@/lib/shopify/actions";
import { getSettings } from "@/lib/settings";
import { getStats } from "@/lib/data";
import { Card, Eyebrow, PageHeader, Skeleton, Thumb, cx } from "@/components/ui";

export const metadata = { title: "Stok" };

export default function StockPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Stok" sub="Shopify'dan canlı. Beden bazında, azalan önce." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireSession();
  const [products, settings, stats] = await Promise.all([getInventory(), getSettings(), getStats(30)]);
  const sold = new Map(stats.topProducts.map((p) => [p.title, p.qty]));
  const low = settings.lowStock;

  const alerts = products.flatMap((p) =>
    p.variants.filter((v) => v.qty <= low).map((v) => ({ p, v })),
  );
  const sorted = [...products].sort(
    (a, b) => Math.min(...a.variants.map((v) => v.qty)) - Math.min(...b.variants.map((v) => v.qty)),
  );
  const totalUnits = products.reduce((s, p) => s + Math.max(0, p.total), 0);

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
        <Card className={cx("p-4", alerts.length > 0 && "border-late/30")}>
          <Eyebrow>Azalan beden</Eyebrow>
          <p className={cx("num mt-2 text-[26px] leading-none font-medium", alerts.length > 0 && "text-late")}>{alerts.length}</p>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-center gap-3">
              <Thumb src={p.image} alt="" size={56} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{p.title}</p>
                <p className="text-[12.5px] text-mute">
                  {p.total} adet{sold.get(p.title) ? ` · 30 günde ${sold.get(p.title)} satış` : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.variants.map((v) => {
                const tone = v.qty <= 0 ? "out" : v.qty <= low ? "low" : "ok";
                return (
                  <div
                    key={v.id}
                    className={cx(
                      "flex min-w-[58px] flex-col items-center rounded-xl border px-2.5 py-1.5",
                      tone === "out" && "border-critical/30 bg-critical/5",
                      tone === "low" && "border-late/30 bg-late/5",
                      tone === "ok" && "border-line bg-paper",
                    )}
                  >
                    <span className="text-[11.5px] text-mute">{v.title}</span>
                    <span
                      className={cx(
                        "num text-[17px] leading-tight font-medium",
                        tone === "out" && "text-critical",
                        tone === "low" && "text-late",
                      )}
                    >
                      {v.qty}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
