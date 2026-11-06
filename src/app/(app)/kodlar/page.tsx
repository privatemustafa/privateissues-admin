import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { listDiscounts } from "@/lib/discounts";
import { storeAdminUrl } from "@/lib/shopify/client";
import { dayLabel, money } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton, cx } from "@/components/ui";
import { CopyButton } from "@/components/small";

export const metadata = { title: "İndirim kodları" };

export default function CodesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="İndirim kodları" sub="Hangi kod kaç kez kullanıldı, ne getirdi" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

const STATUS = { ACTIVE: ["Aktif", "bg-fresh/12 text-fresh"], SCHEDULED: ["Planlı", "bg-due/12 text-due"], EXPIRED: ["Bitti", "bg-line text-mute"] } as const;

async function Content() {
  await requireSession();
  let rows;
  try {
    rows = await listDiscounts();
  } catch (e) {
    return <Card className="p-5 text-[14px] text-late">Shopify&apos;dan kodlar alınamadı: {String(e).slice(0, 160)}</Card>;
  }
  const active = rows.filter((r) => r.status === "ACTIVE");
  const totalUsed = rows.reduce((s, r) => s + r.used, 0);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Aktif kod" value={String(active.length)} sub={`${rows.length} toplam`} />
        <Kpi label="Toplam kullanım" value={String(totalUsed)} sub="Shopify sayacı" />
        <Kpi label="Kodlu ciro" value={money(totalRev)} sub="paneldeki siparişlerden" />
        <Card className="flex flex-col justify-between p-4">
          <Eyebrow>Yeni kod</Eyebrow>
          <a href={storeAdminUrl("/discounts/new")} target="_blank" className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-paper">
            Shopify&apos;da oluştur
          </a>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-mute">
                <th className="px-5 py-3 font-normal">Kod</th>
                <th className="px-2 py-3 font-normal">İndirim</th>
                <th className="px-2 py-3 font-normal">Durum</th>
                <th className="px-2 py-3 text-right font-normal">Kullanım</th>
                <th className="px-2 py-3 text-right font-normal">Sipariş</th>
                <th className="px-2 py-3 text-right font-normal">Ciro</th>
                <th className="px-5 py-3 font-normal">Kime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const [label, cls] = STATUS[r.status];
                return (
                  <tr key={r.id} className={cx(r.status !== "ACTIVE" && "text-mute")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="num font-medium tracking-wide">{r.codes[0] ?? r.title}</span>
                        {r.codes[0] && <CopyButton text={r.codes[0]} label="kopyala" />}
                      </div>
                      {r.automatic && <p className="text-[11.5px] text-faint">otomatik · {r.title}</p>}
                      {r.codes.length > 1 && <p className="text-[11.5px] text-faint">+{r.codes.length - 1} kod daha</p>}
                      {r.endsAt && <p className="text-[11.5px] text-faint">bitiş {dayLabel(r.endsAt)}</p>}
                    </td>
                    <td className="px-2 py-3">{r.value || r.summary.slice(0, 40)}</td>
                    <td className="px-2 py-3">
                      <span className={cx("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", cls)}>{label}</span>
                    </td>
                    <td className="num px-2 py-3 text-right">
                      {r.used}
                      {r.limit ? <span className="text-faint">/{r.limit}</span> : ""}
                    </td>
                    <td className="num px-2 py-3 text-right">{r.orders}</td>
                    <td className="num px-2 py-3 text-right">{r.revenue ? money(r.revenue) : "—"}</td>
                    <td className="px-5 py-3">{r.prHandle ? `@${r.prHandle}` : <span className="text-faint">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] text-faint">
          Kullanım Shopify&apos;ın kendi sayacı; sipariş ve ciro paneldeki siparişlerden (son 60 gün). PR kişisine kod tanımlarsan &quot;Kime&quot; dolar.
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
