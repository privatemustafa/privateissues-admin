import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { expenseSummary, knownDrops, listExpenses } from "@/lib/expenses";
import { money } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton } from "@/components/ui";
import { BarList, SplitBar } from "@/components/ig-charts";
import { ExpenseForm, ExpenseRow } from "@/components/expenses";

export const metadata = { title: "Giderler" };

export default function ExpensesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Giderler" sub="Üretim, çekim, reklam, kargo… ne harcandı" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

async function Content() {
  await requireSession();
  const [rows, sum, drops] = await Promise.all([listExpenses(365), expenseSummary(6), knownDrops()]);
  const thisMonth = sum.byMonth.at(-1)?.value ?? 0;
  const prevMonth = sum.byMonth.at(-2)?.value ?? 0;
  const maxMonth = Math.max(1, ...sum.byMonth.map((m) => m.value));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Eyebrow>Gider ekle</Eyebrow>
        <div className="mt-3">
          <ExpenseForm drops={drops} />
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Bu ay" value={money(thisMonth)} sub={prevMonth ? `geçen ay ${money(prevMonth)}` : undefined} />
            <Kpi label="Son 6 ay" value={money(sum.total)} />
            <Kpi label="En büyük kalem" value={sum.byCat[0]?.key ?? "—"} sub={sum.byCat[0] ? money(sum.byCat[0].value) : undefined} />
            <Kpi label="Kayıt" value={String(rows.length)} sub="son 12 ay" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="min-w-0 p-5">
              <Eyebrow>Aylık</Eyebrow>
              <div className="mt-4">
                <BarList
                  rows={sum.byMonth.map((m) => ({
                    label: `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(2, 4)}`,
                    pct: (m.value / maxMonth) * 100,
                    display: money(m.value),
                  }))}
                />
              </div>
            </Card>
            <Card className="min-w-0 p-5">
              <Eyebrow>Kalemlere göre · 6 ay</Eyebrow>
              <div className="mt-4">
                <SplitBar parts={sum.byCat.slice(0, 4).map((c) => ({ label: c.key, value: c.value }))} />
              </div>
              {sum.byDrop.length > 0 && (
                <>
                  <Eyebrow className="mt-6">Drop&apos;a göre</Eyebrow>
                  <div className="mt-3">
                    <BarList rows={sum.byDrop.map((d) => ({ label: d.key, pct: (d.value / sum.byDrop[0].value) * 100, display: money(d.value) }))} />
                  </div>
                </>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 pt-4 pb-1">
              <Eyebrow>Kayıtlar</Eyebrow>
            </div>
            <div className="divide-y divide-line">
              {rows.map((e) => (
                <ExpenseRow key={e.id} e={e} />
              ))}
            </div>
          </Card>
        </>
      )}
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
