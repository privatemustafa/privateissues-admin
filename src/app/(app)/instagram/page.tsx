import { Suspense } from "react";
import { and, eq, gte, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { getStats } from "@/lib/data";
import { igPosts, igSource, igTimeline, type IgPost } from "@/lib/ig";
import { getIgToken, instagramAppConfigured } from "@/lib/instagram";
import { ActionButton } from "@/components/small";
import { disconnectInstagramAction } from "../actions";
import { compact, dateTime, money } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton, Thumb, cx } from "@/components/ui";
import { ReachVsOrders } from "@/components/charts";

export const metadata = { title: "Instagram" };

const DAYS = 30;

export default function InstagramPage({ searchParams }: PageProps<"/instagram">) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Instagram" sub="privateissues.wrld × satışlar" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content searchParams={searchParams as Promise<{ ok?: string; err?: string }>} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const src = await igSource();
  if (!src) return <Setup err={sp.err} />;

  let data;
  try {
    const [followers, gained, reach, views, interactions, posts, stats] = await Promise.all([
      igTimeline("followers", DAYS),
      igTimeline("followersGained", DAYS),
      igTimeline("reach", DAYS),
      igTimeline("views", DAYS),
      igTimeline("postsInteractions", DAYS),
      igPosts(DAYS),
      getStats(DAYS),
    ]);
    data = { followers, gained, reach, views, interactions, posts, stats };
  } catch (e) {
    return (
      <Card className="p-6">
        <p className="font-medium">Metricool’a bağlanılamadı</p>
        <p className="mt-1 text-[13px] text-mute">{String(e)}</p>
      </Card>
    );
  }
  const { followers, gained, reach, views, interactions, posts, stats } = data;
  const sum = (a: { value: number }[]) => a.reduce((s, p) => s + p.value, 0);
  const nowFollowers = followers.at(-1)?.value ?? 0;

  // Erişim × sipariş birleşik seri
  const reachMap = new Map(reach.map((r) => [r.day, r.value]));
  const merged = stats.points.map((p) => ({ day: p.day, orders: p.orders, reach: reachMap.get(p.day) ?? 0 }));

  // Basit içgörü: yüksek erişimli günleri takip eden 2 günde sipariş ortalaması
  const sortedReach = [...merged].map((m) => m.reach).sort((a, b) => a - b);
  const median = sortedReach[Math.floor(sortedReach.length / 2)] ?? 0;
  const after = (i: number) => (merged[i + 1]?.orders ?? 0) + (merged[i + 2]?.orders ?? 0);
  const hi = merged.map((m, i) => ({ m, i })).filter(({ m, i }) => m.reach > median && i < merged.length - 2);
  const lo = merged.map((m, i) => ({ m, i })).filter(({ m, i }) => m.reach <= median && i < merged.length - 2);
  const avg = (xs: { i: number }[]) => (xs.length ? xs.reduce((s, x) => s + after(x.i), 0) / xs.length : 0);
  const hiAvg = avg(hi);
  const loAvg = avg(lo);

  return (
    <div className="space-y-4">
      {sp.ok && <p className="rounded-2xl bg-fresh/10 p-3 text-[13px] text-fresh">Instagram bağlandı.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Takipçi" value={compact(nowFollowers)} sub={`+${sum(gained)} · 30g`} />
        <Kpi label="Erişim · 30g" value={compact(sum(reach))} />
        <Kpi label="Görüntülenme · 30g" value={compact(sum(views))} />
        <Kpi label="Etkileşim · 30g" value={compact(sum(interactions))} />
      </div>

      <Card className="p-5">
        <Eyebrow>Erişim × sipariş · 30 gün</Eyebrow>
        <div className="mt-4">
          <ReachVsOrders data={merged} />
        </div>
        {hi.length > 2 && lo.length > 2 && (
          <p className="mt-4 border-t border-line pt-4 text-[14px] leading-relaxed text-ink-2">
            Erişimin ortalamanın üstünde olduğu günlerden sonraki 2 günde ortalama{" "}
            <b className="num font-medium text-ink">{hiAvg.toFixed(1)}</b> sipariş geliyor; diğer günlerde{" "}
            <b className="num font-medium text-ink">{loAvg.toFixed(1)}</b>.{" "}
            {hiAvg > loAvg * 1.3
              ? "İçerik satışa dönüyor."
              : hiAvg < loAvg * 0.8
                ? "Erişim satışa dönmüyor; içerikte ürünü ve linki daha net göstermeyi dene."
                : "Fark küçük — veri biriktikçe netleşecek."}
          </p>
        )}
      </Card>

      <Suspense fallback={<Skeleton className="h-64" />}>
        <Posts posts={posts} />
      </Suspense>
      <Suspense fallback={null}>
        <SourceFooter src={src} />
      </Suspense>
    </div>
  );
}

async function SourceFooter({ src }: { src: "instagram" | "metricool" }) {
  const t = src === "instagram" ? await getIgToken() : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[12.5px] text-mute">
      <span>
        Kaynak: {src === "instagram" ? `Instagram${t?.username ? ` (@${t.username})` : ""}` : "Metricool"}
        {t && Number.isFinite(t.expiresAt) && ` · bağlantı ${new Date(t.expiresAt).toLocaleDateString("tr-TR")}'e kadar, otomatik yenilenir`}
      </span>
      {src === "instagram" && !process.env.INSTAGRAM_TOKEN && (
        <ActionButton action={disconnectInstagramAction}>Bağlantıyı kes</ActionButton>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="num mt-2 text-[26px] leading-none font-medium">{value}</p>
      {sub && <p className="num mt-1.5 text-[12.5px] text-fresh">{sub}</p>}
    </Card>
  );
}

async function Posts({ posts }: { posts: IgPost[] }) {
  if (!posts.length) {
    return (
      <Card className="p-5">
        <Eyebrow>İçerikler</Eyebrow>
        <p className="mt-2 text-[14px] text-mute">Son 30 günde içerik verisi gelmedi.</p>
      </Card>
    );
  }

  // Her gönderiden sonraki 48 saatteki siparişler
  const oldest = new Date(Math.min(...posts.map((p) => +new Date(p.publishedAt))));
  const orders = await db()
    .select({ createdAt: schema.orders.createdAt, total: schema.orders.total })
    .from(schema.orders)
    .where(and(gte(schema.orders.createdAt, oldest), eq(schema.orders.test, false), isNull(schema.orders.cancelledAt)));

  const rows = posts.map((p) => {
    const t = +new Date(p.publishedAt);
    const win = orders.filter((o) => +o.createdAt >= t && +o.createdAt < t + 48 * 3_600_000);
    return { p, n: win.length, rev: win.reduce((s, o) => s + o.total, 0) };
  });

  const byType = (t: IgPost["type"]) => posts.filter((p) => p.type === t);
  const avgReach = (xs: IgPost[]) => (xs.length ? xs.reduce((s, p) => s + p.reach, 0) / xs.length : 0);
  const topSaved = [...posts].sort((a, b) => b.saves - a.saves)[0];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Reel ort. erişim" value={compact(avgReach(byType("reel")))} />
        <Kpi label="Post ort. erişim" value={compact(avgReach(byType("post")))} />
        {topSaved && topSaved.saves > 0 && (
          <Card className="col-span-2 p-4 md:col-span-1">
            <Eyebrow>En çok kaydedilen</Eyebrow>
            <p className="mt-2 line-clamp-2 text-[14px]">{topSaved.caption || "—"}</p>
            <p className="num mt-1 text-[12.5px] text-mute">{topSaved.saves} kayıt</p>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <Eyebrow>İçerikler · paylaşım sonrası 48 saat</Eyebrow>
        </div>
        <div className="divide-y divide-line">
          {rows.map(({ p, n, rev }) => (
            <a
              key={p.id}
              href={p.url ?? undefined}
              target="_blank"
              className="flex items-center gap-3 px-4 py-3 hover:bg-paper"
            >
              <Thumb src={p.image} alt="" size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{p.caption || (p.type === "reel" ? "Reel" : "Post")}</p>
                <p className="text-[12px] text-mute">
                  {p.type === "reel" ? "Reel" : "Post"} · {dateTime(p.publishedAt)}
                </p>
                <p className="num mt-0.5 text-[12px] text-ink-2">
                  {compact(p.reach)} erişim · {p.saves} kayıt · {p.shares} paylaşım
                </p>
              </div>
              <div className="text-right">
                <p className={cx("num text-[15px] font-medium", n ? "text-ink" : "text-faint")}>{n} sipariş</p>
                <p className="num text-[12px] text-mute">{n ? money(rev) : ""}</p>
              </div>
            </a>
          ))}
        </div>
      </Card>
    </>
  );
}

function Setup({ err }: { err?: string }) {
  const ready = instagramAppConfigured();
  return (
    <div className="space-y-4">
      {err && <p className="rounded-2xl bg-late/10 p-3 text-[13px] text-late">Bağlantı kurulamadı: {err === "state" ? "oturum doğrulanamadı, tekrar dene" : err}</p>}
      <Card className="p-6">
        <p className="text-[20px] font-medium tracking-tight">Instagram&apos;ı bağla</p>
        {ready ? (
          <>
            <p className="mt-1 max-w-md text-[14px] text-mute">
              Instagram&apos;a yönlendirilirsin; <b className="font-medium text-ink">privateissues.wrld</b> ile giriş yapıp izin verince
              takipçi, erişim ve içerik verileri burada görünür. Bağlantı 60 günde bir kendiliğinden yenilenir.
            </p>
            <a
              href="/api/instagram/connect"
              className="mt-5 inline-flex h-12 items-center rounded-2xl bg-ink px-6 text-[15px] font-medium text-paper"
            >
              Instagram ile bağlan
            </a>
          </>
        ) : (
          <>
            <p className="mt-1 max-w-lg text-[14px] text-mute">
              Bir kerelik kurulum: developers.facebook.com&apos;da ücretsiz bir uygulama aç, <b className="font-medium text-ink">Instagram</b>{" "}
              ürününü ekle, yönlendirme adresine aşağıdakini yaz ve Instagram uygulama kimliğiyle gizli anahtarı Vercel&apos;e ekle.
              Ayrıntılı adımlar README&apos;de.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-paper p-4 text-[13px] leading-relaxed">
              {`Yönlendirme (redirect) adresi:
${(process.env.APP_URL || "https://admin.privateissues.com").replace(/\/$/, "")}/api/instagram/callback

Vercel → Environment Variables:
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...`}
            </pre>
          </>
        )}
      </Card>
      <p className="px-1 text-[12.5px] text-faint">
        Alternatif: Metricool Advanced planındaysan METRICOOL_TOKEN ile de bağlanır.
      </p>
    </div>
  );
}
