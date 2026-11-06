import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getPending, getRecentOrders, getStats, worstUrgency } from "@/lib/data";
import { metricoolConfigured, igTimeline } from "@/lib/metricool";
import { compact, istanbulHour, money, TZ, urgencyLabel } from "@/lib/format";
import { Card, Delta, EmptyState, Eyebrow, Skeleton, Thumb, cx, urgencyColor } from "@/components/ui";
import { OrderRow, PendingTile } from "@/components/orders";
import { DailyBars, Sparkline } from "@/components/charts";

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<div className="h-[76px]" />}>
        <Greeting />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <Suspense fallback={<Skeleton className="h-72" />}>
            <PendingHero />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-80" />}>
            <Recent />
          </Suspense>
        </div>
        <div className="space-y-4">
          <Suspense fallback={<Skeleton className="h-64" />}>
            <Numbers />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-28" />}>
            <InstagramMini />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Greeting() {
  await requireSession();
  const h = istanbulHour();
  const hello = h < 5 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
  const date = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(),
  );
  return (
    <header className="pt-2 pb-5 md:pt-6">
      <p className="text-[13px] text-mute capitalize">{date}</p>
      <h1 className="text-[30px] leading-[1.05] font-medium tracking-[-0.03em] md:text-[36px]">{hello}.</h1>
    </header>
  );
}

async function PendingHero() {
  await requireSession();
  const pending = await getPending();
  const worst = worstUrgency(pending);

  if (!pending.length) {
    return (
      <Card className="p-6">
        <Eyebrow>Kargo</Eyebrow>
        <p className="mt-3 text-[26px] leading-tight font-medium tracking-tight">Bekleyen paket yok.</p>
        <p className="mt-1 text-[14px] text-mute">Her şey yolda. Yeni sipariş gelince buraya düşer, telefonun titrer.</p>
      </Card>
    );
  }

  const color = worst ? urgencyColor[worst] : "var(--color-ink)";
  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ background: color }} />
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <Eyebrow>Kargolanacak</Eyebrow>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="num text-[64px] leading-[0.85] font-medium tracking-[-0.05em]">{pending.length}</span>
              <span className="text-[17px] text-ink-2">paket bekliyor</span>
            </p>
          </div>
          {worst && worst !== "fresh" && (
            <span
              className="mt-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
              style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
            >
              {urgencyLabel[worst]}
            </span>
          )}
        </div>
        <div className="mt-5 space-y-2">
          {pending.slice(0, 6).map((o) => (
            <PendingTile key={o.id} o={o} />
          ))}
        </div>
        {pending.length > 6 && (
          <Link href="/orders?status=open" className="mt-3 block text-center text-[14px] font-medium text-ink-2">
            +{pending.length - 6} paket daha →
          </Link>
        )}
      </div>
    </Card>
  );
}

async function Numbers() {
  await requireSession();
  const s = await getStats(30);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <Eyebrow>Bugün</Eyebrow>
          <p className="num mt-2 text-[28px] leading-none font-medium">{money(s.today.revenue)}</p>
          <p className="mt-1.5 text-[13px] text-mute">
            {s.today.orders} sipariş · dün {s.yesterday.orders}
          </p>
        </Card>
        <Card className="p-4">
          <Eyebrow>7 gün</Eyebrow>
          <p className="num mt-2 text-[28px] leading-none font-medium">{money(s.week.revenue)}</p>
          <p className="mt-1.5 text-[13px] text-mute">{s.week.orders} sipariş</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-end justify-between">
          <div>
            <Eyebrow>Son 30 gün</Eyebrow>
            <p className="num mt-2 text-[34px] leading-none font-medium tracking-[-0.04em]">{money(s.period.revenue)}</p>
          </div>
          <div className="text-right">
            <Delta now={s.period.revenue} prev={s.period.prevRevenue} />
            <p className="text-[12px] text-faint">önceki 30 güne göre</p>
          </div>
        </div>
        <div className="mt-5">
          <DailyBars data={s.points.map((p) => ({ day: p.day, value: p.revenue, label: `${money(p.revenue)} · ${p.orders} sipariş` }))} />
        </div>
        <div className="mt-5 grid grid-cols-3 border-t border-line pt-4 text-center">
          <Mini label="Sipariş" value={String(s.period.orders)} />
          <Mini label="Sepet ort." value={money(s.period.aov)} />
          <Mini label="Tekrar alan" value={String(s.period.returning)} />
        </div>
      </Card>

      {s.topProducts.length > 0 && (
        <Card className="p-5">
          <Eyebrow>En çok satan · 30 gün</Eyebrow>
          <ul className="mt-3 space-y-2.5">
            {s.topProducts.map((p, i) => (
              <li key={p.title} className="flex items-center gap-3">
                <span className="num w-4 text-[12px] text-faint">{i + 1}</span>
                <Thumb src={p.image} alt="" size={36} />
                <span className="flex-1 truncate text-[14px]">{p.title}</span>
                <span className="num text-[14px] font-medium">{p.qty}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="num text-[17px] font-medium">{value}</p>
      <p className="text-[11.5px] text-mute">{label}</p>
    </div>
  );
}

async function Recent() {
  await requireSession();
  const orders = await getRecentOrders(8);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <Eyebrow>Son siparişler</Eyebrow>
        <Link href="/orders?status=all" className="text-[13px] text-mute">
          Tümü →
        </Link>
      </div>
      {orders.length ? (
        <div className="divide-y divide-line">
          {orders.map((o) => (
            <OrderRow key={o.id} o={o} href={`/orders/${encodeURIComponent(o.id)}?status=all`} />
          ))}
        </div>
      ) : (
        <EmptyState title="Henüz sipariş yok" sub="Ayarlar → Senkronize et ile geçmiş siparişleri çek." action={<Link href="/settings" className="text-[14px] font-medium underline">Ayarlar</Link>} />
      )}
    </Card>
  );
}

async function InstagramMini() {
  await requireSession();
  if (!metricoolConfigured()) return null;
  const data = await Promise.all([igTimeline("followers", 30), igTimeline("reach", 7)]).catch(() => null);
  if (!data) return null;
  const [followers, reach] = data;
  const last = followers.at(-1)?.value ?? 0;
  const first = followers.find((p) => p.value > 0)?.value ?? last;
  const reach7 = reach.reduce((a, p) => a + p.value, 0);
  return (
    <Link href="/instagram" className="block">
      <Card className="p-5 transition hover:border-faint">
        <div className="flex items-center justify-between">
          <Eyebrow lang="en">Instagram · privateissues.wrld</Eyebrow>
          <span className="text-[13px] text-mute">→</span>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr] items-end gap-5">
          <div>
            <p className="num text-[28px] leading-none font-medium">{compact(last)}</p>
            <p className={cx("num mt-1 text-[12.5px]", last - first >= 0 ? "text-fresh" : "text-late")}>
              {last - first >= 0 ? "+" : ""}
              {last - first} takipçi · 30g
            </p>
          </div>
          <div>
            <Sparkline values={followers.map((p) => p.value).filter(Boolean)} />
            <p className="mt-1 text-right text-[12px] text-mute">{compact(reach7)} erişim · 7g</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
