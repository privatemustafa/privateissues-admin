import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { adsOverview, listAdAccounts } from "@/lib/ads";
import { instagramConnected } from "@/lib/instagram";
import { compact, money } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton, cx } from "@/components/ui";
import { ReachVsOrders } from "@/components/charts";
import { ActionButton } from "@/components/small";
import { adAccountSelectAction } from "../actions";

export const metadata = { title: "Reklam" };

export default function AdsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reklam" sub="Meta reklamları · harcama ve dönüş" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireSession();
  if (!(await instagramConnected())) {
    return <Card className="p-5 text-[14px] text-mute">Reklam verisi Instagram bağlantısıyla gelir. Önce Instagram sayfasından bağlan.</Card>;
  }
  let data: Awaited<ReturnType<typeof adsOverview>>;
  try {
    data = await adsOverview(30);
  } catch (e) {
    const msg = String(e);
    return (
      <Card className="p-5">
        <p className="text-[15px] font-medium">Reklam verisi alınamadı</p>
        <p className="mt-1 text-[13px] text-mute">{msg.slice(0, 200)}</p>
        <p className="mt-3 text-[13px] text-ink-2">
          Büyük ihtimalle izin eksik: Meta giriş ayarına <b className="font-medium">ads_read</b> izni ve <b className="font-medium">Ad accounts</b> varlığı eklenip
          Instagram yeniden bağlanmalı.
        </p>
      </Card>
    );
  }
  if (!data) {
    const accounts = await listAdAccounts();
    return (
      <Card className="p-5">
        <p className="text-[15px] font-medium">Reklam hesabı bulunamadı</p>
        <p className="mt-1 text-[13px] text-mute">
          Bağlantı reklam hesabını görmüyor. Meta giriş ayarında &quot;Ad accounts&quot; varlığı seçili olmalı ve Instagram yeniden bağlanmalı.
        </p>
        {accounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {accounts.map((a) => (
              <ActionButton key={a.id} action={adAccountSelectAction.bind(null, a.id)}>
                {a.name} ({a.currency})
              </ActionButton>
            ))}
          </div>
        )}
      </Card>
    );
  }
  const t = data.totals;
  const roas = t.spend ? t.purchaseValue / t.spend : 0;
  const cpa = t.purchases ? t.spend / t.purchases : 0;
  const merged = data.daily.map((d) => ({ day: d.day, reach: d.spend, orders: d.purchases }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Harcama · 30g" value={money(t.spend)} />
        <Kpi label="Reklamdan satış" value={money(t.purchaseValue)} sub={`${t.purchases} satın alma`} />
        <Kpi label="ROAS" value={roas ? `${roas.toFixed(1)}×` : "—"} sub={roas ? (roas >= 3 ? "iyi" : roas >= 1.5 ? "idare eder" : "zararda") : "satın alma yok"} />
        <Kpi label="Satış başı maliyet" value={cpa ? money(cpa) : "—"} sub={t.clicks ? `tık ${money(t.cpc)} · CTR %${t.ctr.toFixed(2)}` : undefined} />
      </div>

      <Card className="p-5">
        <Eyebrow>Harcama × satın alma · günlük</Eyebrow>
        <div className="mt-4">
          <ReachVsOrders data={merged} />
        </div>
        <p className="mt-2 text-[11.5px] text-mute">Çizgi: harcama · Çubuk: satın alma</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <Eyebrow>Kampanyalar · 30g</Eyebrow>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-mute">
                <th className="px-5 py-2 font-normal">Kampanya</th>
                <th className="px-2 py-2 text-right font-normal">Harcama</th>
                <th className="px-2 py-2 text-right font-normal">Erişim</th>
                <th className="px-2 py-2 text-right font-normal">Tık</th>
                <th className="px-2 py-2 text-right font-normal">Sepet</th>
                <th className="px-2 py-2 text-right font-normal">Satış</th>
                <th className="px-5 py-2 text-right font-normal">ROAS</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {data.campaigns.map((c) => (
                <tr key={c.id} className={cx(c.roas > 0 && c.roas < 1 && c.spend > 500 && "text-late")}>
                  <td className="max-w-[260px] truncate px-5 py-2.5 font-sans">{c.name}</td>
                  <td className="px-2 py-2.5 text-right">{money(c.spend)}</td>
                  <td className="px-2 py-2.5 text-right">{compact(c.reach)}</td>
                  <td className="px-2 py-2.5 text-right">{compact(c.clicks)}</td>
                  <td className="px-2 py-2.5 text-right">{c.addToCart}</td>
                  <td className="px-2 py-2.5 text-right">{c.purchases}{c.purchaseValue ? ` · ${money(c.purchaseValue)}` : ""}</td>
                  <td className="px-5 py-2.5 text-right">{c.roas ? `${c.roas.toFixed(1)}×` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-faint">
          Satış rakamları Meta pikselinin saydığı kadar; Shopify&apos;daki gerçek siparişle birebir olmayabilir. Kırmızı satır: 500₺ üstü harcayıp
          harcadığını geri getirmeyen kampanya.
        </p>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="num mt-2 truncate text-[22px] leading-none font-medium">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-mute">{sub}</p>}
    </Card>
  );
}
