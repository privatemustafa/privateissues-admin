import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getWarehouse } from "@/lib/warehouse";
import { getSettings } from "@/lib/settings";
import { getInventory } from "@/lib/shopify/actions";
import { dateTime, isRecent, money } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton, cx } from "@/components/ui";
import { DepoBoard, UnmatchedBox } from "@/components/depo-board";
import { ActionButton } from "@/components/small";
import { depoSeedFromShopifyAction } from "../actions";

export const metadata = { title: "Depo" };

export default function DepoPage({ searchParams }: PageProps<"/depo">) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Depo"
        sub="Elindeki stok. Siparişler buradan düşer."
        right={
          <div className="flex shrink-0 gap-2">
            <Link href="/depo/import" className="h-9 whitespace-nowrap rounded-full border border-line bg-card px-3.5 text-[13px] leading-9 font-medium">
              İçe aktar
            </Link>
            <Link href="/stock" className="h-9 whitespace-nowrap rounded-full border border-line bg-card px-3.5 text-[13px] leading-9 font-medium md:hidden">
              Shopify
            </Link>
            <a href="/api/depo/export" className="hidden h-9 rounded-full border border-line bg-card px-3.5 text-[13px] leading-9 font-medium sm:block">
              CSV indir
            </a>
          </div>
        }
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content searchParams={searchParams as Promise<{ q?: string }>} />
      </Suspense>
    </div>
  );
}

const reasonLabel: Record<string, string> = {
  order: "Sipariş",
  cancel: "İptal · geri",
  restock: "Giriş",
  count: "Sayım",
  out: "Çıkış",
  return: "İade",
  import: "Aktarım",
};

async function Content({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSession();
  const { q } = await searchParams;
  const [{ items, moves, unmatched, started }, settings, shop] = await Promise.all([
    getWarehouse(),
    getSettings(),
    getInventory().catch(() => null),
  ]);

  if (!items.length) {
    return (
      <Card className="p-6 md:p-8">
        <p className="text-[22px] font-medium tracking-tight">Depo boş.</p>
        <p className="mt-1 max-w-md text-[14px] text-mute">
          Elindeki stoğu bir kez gir; bundan sonra her sipariş otomatik düşer, iptal olursa geri eklenir, azalınca bildirim
          gelir.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/depo/import" className="rounded-2xl bg-ink p-4 text-paper">
            <p className="text-[15px] font-medium">Listeni yapıştır</p>
            <p className="mt-1 text-[13px] text-paper/65">Excel / Sheets&apos;ten kopyala → yapıştır. Ürün, beden, adet yeter.</p>
          </Link>
          <div className="rounded-2xl border border-line p-4">
            <p className="text-[15px] font-medium">Shopify stoğuyla başlat</p>
            <p className="mt-1 mb-3 text-[13px] text-mute">Ürünler, bedenler ve fotoğraflar hazır gelir; sonra sayımla düzeltirsin.</p>
            <ActionButton action={depoSeedFromShopifyAction}>Shopify&apos;dan çek</ActionButton>
          </div>
        </div>
      </Card>
    );
  }

  const low = settings.lowStock;
  const units = items.reduce((s, i) => s + Math.max(0, i.qty), 0);
  const lowN = items.filter((i) => i.qty > 0 && i.qty <= (i.minQty ?? low)).length;
  const outN = items.filter((i) => i.qty <= 0).length;
  const value = items.reduce((s, i) => s + (i.cost ? Math.max(0, i.qty) * i.cost : 0), 0);
  const shopify: Record<string, number> = {};
  for (const p of shop ?? []) for (const v of p.variants) shopify[v.id] = v.qty;
  const soldToday = moves.filter((m) => m.m.reason === "order" && isRecent(m.m.createdAt, 86_400_000)).reduce((s, m) => s - m.m.delta, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Elde" value={String(units)} sub={`${items.length} ürün-beden`} />
        <Kpi label="24 saatte düşen" value={String(soldToday)} sub="siparişlerden" />
        <Kpi label="Azalan / biten" value={`${lowN} / ${outN}`} tone={lowN + outN > 0 ? "late" : undefined} />
        <Kpi label="Stok değeri" value={value ? money(value) : "—"} sub={value ? "maliyetten" : "maliyet girilmemiş"} />
      </div>

      {!settings.warehouseAutoDeduct && (
        <p className="rounded-2xl bg-due/10 p-3 text-[13px]">
          Otomatik düşme kapalı. <Link href="/settings" className="underline">Ayarlar</Link>&apos;dan açabilirsin.
        </p>
      )}

      <UnmatchedBox moves={unmatched} items={items} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <DepoBoard items={items} low={low} shopify={shopify} initialQuery={q} />

        <Card className="h-fit overflow-hidden lg:sticky lg:top-6">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <Eyebrow>Hareketler</Eyebrow>
            {started && <span className="text-[11.5px] text-faint">{dateTime(started)}&apos;den beri</span>}
          </div>
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
            {moves.map(({ m, product, variant, color }) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={cx(
                    "num w-11 shrink-0 text-right text-[15px] font-medium",
                    m.delta > 0 ? "text-fresh" : m.delta < 0 ? "text-ink" : "text-faint",
                  )}
                >
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px]">
                    {[product ?? m.meta?.title, color, variant].filter(Boolean).join(" · ")}
                  </p>
                  <p className="truncate text-[11.5px] text-mute">
                    {reasonLabel[m.reason] ?? m.reason}
                    {m.refName && (
                      <>
                        {" · "}
                        <Link href={`/orders/${encodeURIComponent(m.ref ?? "")}?status=all`} className="underline">
                          {m.refName}
                        </Link>
                      </>
                    )}
                    {m.note && ` · ${m.note}`}
                  </p>
                </div>
                <div className="text-right">
                  {m.qtyAfter != null && <p className="num text-[12px] text-ink-2">→ {m.qtyAfter}</p>}
                  <p className="text-[11px] text-faint">{dateTime(m.createdAt)}</p>
                </div>
              </li>
            ))}
            {!moves.length && <li className="px-4 py-6 text-center text-[13px] text-mute">Henüz hareket yok.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "late" }) {
  return (
    <Card className={cx("p-4", tone === "late" && "border-late/30")}>
      <Eyebrow>{label}</Eyebrow>
      <p className={cx("num mt-2 text-[26px] leading-none font-medium", tone === "late" && "text-late")}>{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-mute">{sub}</p>}
    </Card>
  );
}
