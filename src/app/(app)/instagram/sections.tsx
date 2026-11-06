import { and, eq, gte, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { graphMedia, graphPosts } from "@/lib/instagram";
import { demographics, onlineFollowersByHour, totalWithBreakdown, type Slice } from "@/lib/ig-insights";
import { customerCities, dropReport, listDrops, listStories, normCity } from "@/lib/ig-store";
import type { IgPost } from "@/lib/ig";
import { compact, dateTime, dayLabel, money, TZ } from "@/lib/format";
import { Card, Eyebrow, Thumb, cx } from "@/components/ui";
import { BarList, DropChart, HourBars, SplitBar } from "@/components/ig-charts";
import { ActionButton } from "@/components/small";
import { DropForm } from "@/components/drop-form";
import { deleteDropAction, snapshotStoriesAction } from "../actions";

const pct = (v: number, total: number) => (total ? (v / total) * 100 : 0);
const one = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
const sumOf = (xs: Slice[]) => xs.reduce((s, x) => s + x.value, 0);

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <Card className="p-5">
      <Eyebrow>{title}</Eyebrow>
      <p className="mt-2 text-[14px] text-mute">{sub}</p>
    </Card>
  );
}

function Insight({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 border-t border-line pt-4 text-[14px] leading-relaxed text-ink-2">{children}</p>;
}

// ---------------------------------------------------------------------------
// Genel: erişim kaynağı + profil hareketleri

export async function Sources() {
  await requireSession();
  const [byFollow, byType, follows, links] = await Promise.all([
    totalWithBreakdown("reach", "follow_type"),
    totalWithBreakdown("reach", "media_product_type"),
    totalWithBreakdown("follows_and_unfollows", "follow_type"),
    totalWithBreakdown("profile_links_taps", "contact_button_type"),
  ]);
  const v = (s: Slice[] | undefined, k: string) => s?.find((x) => x.key === k)?.value ?? 0;
  const nonFollower = v(byFollow?.slices, "NON_FOLLOWER");
  const follower = v(byFollow?.slices, "FOLLOWER");
  const followed = v(follows?.slices, "FOLLOWER");
  const unfollowed = v(follows?.slices, "NON_FOLLOWER");
  const typeNames: Record<string, string> = { POST: "Post", REEL: "Reel", STORY: "Story", AD: "Reklam", CAROUSEL_CONTAINER: "Carousel", IGTV: "Video" };
  const linkNames: Record<string, string> = {
    BOOK_NOW: "Rezervasyon",
    CALL: "Arama",
    DIRECTION: "Yol tarifi",
    EMAIL: "E-posta",
    INSTANT_EXPERIENCE: "Deneyim",
    TEXT: "Mesaj",
    UNDEFINED: "Bio linki",
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="min-w-0 p-5">
        <Eyebrow>Erişim nereden · 30g</Eyebrow>
        {byFollow && follower + nonFollower > 0 ? (
          <>
            <div className="mt-4">
              <SplitBar
                parts={[
                  { label: "Takipçi olmayan", value: nonFollower },
                  { label: "Takipçi", value: follower },
                ]}
              />
            </div>
            {byType && byType.slices.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[12px] text-mute">İçerik türüne göre</p>
                <SplitBar parts={byType.slices.map((s) => ({ label: typeNames[s.key] ?? s.key, value: s.value }))} />
              </div>
            )}
            <Insight>
              Erişimin <b className="num font-medium text-ink">%{Math.round(pct(nonFollower, follower + nonFollower))}</b>&apos;i seni
              takip etmeyenlerden geliyor.{" "}
              {pct(nonFollower, follower + nonFollower) > 50
                ? "İçerikler keşfete düşüyor; yeni kitleye ulaşıyorsun."
                : "Daha çok mevcut takipçine gösteriliyor; keşif için reel ve paylaşılabilir içerik dene."}
            </Insight>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-mute">Veri gelmedi.</p>
        )}
      </Card>

      <Card className="min-w-0 p-5">
        <Eyebrow>Profil hareketi · 30g</Eyebrow>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="num text-[24px] leading-none font-medium">{compact(followed)}</p>
            <p className="mt-1 text-[12px] text-mute">takip etti</p>
          </div>
          <div>
            <p className="num text-[24px] leading-none font-medium">{compact(unfollowed)}</p>
            <p className="mt-1 text-[12px] text-mute">bıraktı</p>
          </div>
          <div>
            <p className="num text-[24px] leading-none font-medium">{compact(links?.total ?? 0)}</p>
            <p className="mt-1 text-[12px] text-mute">link tıklaması</p>
          </div>
        </div>
        {links && links.slices.length > 0 && (
          <div className="mt-5">
            <SplitBar parts={links.slices.map((s) => ({ label: linkNames[s.key] ?? s.key, value: s.value }))} />
          </div>
        )}
        {followed + unfollowed > 0 && (
          <Insight>
            Net <b className="num font-medium text-ink">{followed - unfollowed >= 0 ? "+" : ""}{followed - unfollowed}</b> takipçi.
            Her 100 yeni takipçiye karşı {Math.round(pct(unfollowed, followed))} kişi bırakmış.
          </Insight>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kitle: takipçi şehirleri × müşteri şehirleri, yaş, cinsiyet, ülke

const GENDER: Record<string, string> = { F: "Kadın", M: "Erkek", U: "Belirtilmemiş" };

export async function Audience() {
  await requireSession();
  const [cities, ages, engagedAges, genders, countries, customers] = await Promise.all([
    demographics("follower_demographics", "city"),
    demographics("follower_demographics", "age"),
    demographics("engaged_audience_demographics", "age"),
    demographics("follower_demographics", "gender"),
    demographics("follower_demographics", "country"),
    customerCities(90),
  ]);
  if (!cities.length && !ages.length) {
    return <Empty title="Kitle" sub="Instagram kitle verisi gelmedi. Bu veri 100 takipçinin üstündeki hesaplarda ve birkaç gün gecikmeli gelir." />;
  }

  const cityTotal = sumOf(cities);
  const custMap = new Map(customers.cities.map((c) => [c.key, c.value]));
  const cityRows = cities.slice(0, 8).map((c) => ({
    label: c.key.split(",")[0],
    pct: pct(c.value, cityTotal),
    compare: customers.total ? pct(custMap.get(normCity(c.key)) ?? 0, customers.total) : null,
  }));
  // Takipçide az ama siparişte güçlü şehirler
  const igCityKeys = new Set(cities.slice(0, 8).map((c) => normCity(c.key)));
  const extraCustomer = customers.cities.filter((c) => !igCityKeys.has(c.key)).slice(0, 3);

  const gap = cityRows
    .filter((r) => r.compare !== null)
    .map((r) => ({ ...r, gap: (r.compare ?? 0) - r.pct }))
    .sort((a, b) => b.gap - a.gap);
  const over = gap[0];
  const under = gap.at(-1);

  const ageTotal = sumOf(ages);
  const engagedMap = new Map(engagedAges.map((a) => [a.key, a.value]));
  const engagedTotal = sumOf(engagedAges);
  const ageRows = [...ages]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((a) => ({ label: a.key, pct: pct(a.value, ageTotal), compare: engagedTotal ? pct(engagedMap.get(a.key) ?? 0, engagedTotal) : undefined }));

  const regions = new Intl.DisplayNames(["tr"], { type: "region" });
  const countryTotal = sumOf(countries);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Eyebrow>Şehirler · takipçi × müşteri</Eyebrow>
        <div className="mt-4">
          <BarList rows={cityRows} legend={["Takipçi", `Sipariş (son 90 gün, ${customers.total})`]} />
        </div>
        {extraCustomer.length > 0 && (
          <p className="mt-3 text-[12.5px] text-mute">
            Takipçi listesinde üstte olmayıp sipariş veren şehirler:{" "}
            {extraCustomer.map((c) => `${c.label} (${c.value})`).join(", ")}
          </p>
        )}
        {customers.total >= 5 && over && under && over.gap > 5 && (
          <Insight>
            <b className="font-medium text-ink">{over.label}</b> siparişte takipçi payından{" "}
            <b className="num font-medium text-ink">{Math.round(over.gap)} puan</b> güçlü; bu şehir satın almaya yatkın, reklamda
            öne al.{" "}
            {under.gap < -5 && (
              <>
                <b className="font-medium text-ink">{under.label}</b> ise takipçi çok ama sipariş az; teslimat, kargo süresi ya da fiyat
                algısına bak.
              </>
            )}
          </Insight>
        )}
        {customers.total < 5 && (
          <p className="mt-3 text-[12.5px] text-faint">Sipariş verisi biriktikçe karşılaştırma netleşecek.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="min-w-0 p-5">
          <Eyebrow>Yaş · takipçi × etkileşen</Eyebrow>
          <div className="mt-4">
            {ageRows.length ? (
              <BarList rows={ageRows} legend={engagedTotal ? ["Takipçi", "Etkileşen"] : undefined} />
            ) : (
              <p className="text-[14px] text-mute">Veri yok.</p>
            )}
          </div>
        </Card>
        <Card className="min-w-0 p-5">
          <Eyebrow>Cinsiyet</Eyebrow>
          <div className="mt-4">
            {genders.length ? (
              <SplitBar parts={genders.map((g) => ({ label: GENDER[g.key] ?? g.key, value: g.value }))} />
            ) : (
              <p className="text-[14px] text-mute">Veri yok.</p>
            )}
          </div>
          <Eyebrow className="mt-6">Ülkeler</Eyebrow>
          <div className="mt-3">
            <BarList
              rows={countries.slice(0, 5).map((c) => ({
                label: (() => {
                  try {
                    return regions.of(c.key) ?? c.key;
                  } catch {
                    return c.key;
                  }
                })(),
                pct: pct(c.value, countryTotal),
              }))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zamanlama: takipçiler ne zaman çevrimiçi, hangi gün/saat paylaşım daha iyi gidiyor

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const wdIndex = (d: Date) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d));
const hourOf = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d));

export async function Timing() {
  await requireSession();
  const [hours, media] = await Promise.all([onlineFollowersByHour(), graphMedia(24).catch(() => [] as IgPost[])]);

  const top = hours
    ? [...hours].map((v, h) => ({ v, h })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.h).sort((a, b) => a - b)
    : [];

  // Paylaşım günü/saati → ortalama erişim
  const byDay = WEEKDAYS.map(() => ({ n: 0, reach: 0 }));
  const slots = [
    { label: "Sabah (06–12)", from: 6, to: 12 },
    { label: "Öğlen (12–17)", from: 12, to: 17 },
    { label: "Akşam (17–22)", from: 17, to: 22 },
    { label: "Gece (22–06)", from: 22, to: 30 },
  ].map((s) => ({ ...s, n: 0, reach: 0 }));
  for (const m of media) {
    const d = new Date(m.publishedAt);
    const wd = wdIndex(d);
    if (wd >= 0) {
      byDay[wd].n++;
      byDay[wd].reach += m.reach;
    }
    const h = hourOf(d);
    const slot = slots.find((s) => (h >= s.from && h < s.to) || (s.to > 24 && h < s.to - 24));
    if (slot) {
      slot.n++;
      slot.reach += m.reach;
    }
  }
  const dayAvg = byDay.map((d) => (d.n ? d.reach / d.n : 0));
  const maxDay = Math.max(1, ...dayAvg);
  const slotAvg = slots.map((s) => (s.n ? s.reach / s.n : 0));
  const maxSlot = Math.max(1, ...slotAvg);
  // Tek paylaşımlık şans eseri patlamaları saymamak için en az 3 paylaşım olan dilimler arasından seç
  const pick = (avgs: number[], ns: number[]) => {
    const ok = avgs.map((v, i) => ({ v, i })).filter((x) => ns[x.i] >= 3);
    const pool = ok.length ? ok : avgs.map((v, i) => ({ v, i }));
    return pool.sort((a, b) => b.v - a.v)[0]?.i ?? 0;
  };
  const bestDay = pick(dayAvg, byDay.map((d) => d.n));
  const bestSlot = pick(slotAvg, slots.map((s) => s.n));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Eyebrow>Takipçiler ne zaman çevrimiçi · İstanbul saati</Eyebrow>
        {hours ? (
          <>
            <div className="mt-4">
              <HourBars values={hours} />
            </div>
            <Insight>
              En kalabalık saatler{" "}
              <b className="num font-medium text-ink">{top.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ")}</b>. Paylaşımı
              bu saatlerden <b className="font-medium text-ink">30–60 dk önce</b> yap; ilk saatteki etkileşim erişimi belirliyor.
            </Insight>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-mute">
            Instagram bu veriyi 100 takipçinin altındaki hesaplara vermiyor ya da henüz hazır değil.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="min-w-0 p-5">
          <Eyebrow>Paylaşım günü · ort. erişim</Eyebrow>
          <div className="mt-4">
            <BarList
              rows={WEEKDAYS.map((d, i) => ({
                label: d,
                pct: (dayAvg[i] / maxDay) * 100,
                display: byDay[i].n ? `${compact(dayAvg[i])} · ${byDay[i].n}` : "—",
              }))}
            />
          </div>
        </Card>
        <Card className="min-w-0 p-5">
          <Eyebrow>Paylaşım saati · ort. erişim</Eyebrow>
          <div className="mt-4">
            <BarList
              rows={slots.map((s, i) => ({
                label: s.label,
                pct: (slotAvg[i] / maxSlot) * 100,
                display: s.n ? `${compact(slotAvg[i])} · ${s.n}` : "—",
              }))}
            />
          </div>
          {media.length >= 6 && (
            <Insight>
              Son {media.length} paylaşımda en iyi sonuç <b className="font-medium text-ink">{WEEKDAYS[bestDay]}</b> günü ve{" "}
              <b className="font-medium text-ink">{slots[bestSlot].label.split(" ")[0].toLowerCase()}</b> paylaşılanlarda. Az paylaşım
              olan dilimler hesaba katılmadı; paylaşım sayısı yanında yazıyor.
            </Insight>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// İçerik: tür kıyası + reel karnesi + son içerikler (48 saat sipariş)

const FORMAT: Record<string, string> = { video: "Reel", image: "Tek görsel", carousel: "Carousel" };

async function ordersAfter(posts: IgPost[]) {
  if (!posts.length) return new Map<string, { n: number; rev: number }>();
  const oldest = new Date(Math.min(...posts.map((p) => +new Date(p.publishedAt))));
  const orders = await db()
    .select({ createdAt: schema.orders.createdAt, total: schema.orders.total })
    .from(schema.orders)
    .where(and(gte(schema.orders.createdAt, oldest), eq(schema.orders.test, false), isNull(schema.orders.cancelledAt)));
  return new Map(
    posts.map((p) => {
      const t = +new Date(p.publishedAt);
      const win = orders.filter((o) => +o.createdAt >= t && +o.createdAt < t + 48 * 3_600_000);
      return [p.id, { n: win.length, rev: win.reduce((s, o) => s + o.total, 0) }];
    }),
  );
}

export async function Content() {
  await requireSession();
  const [all, recent] = await Promise.all([graphMedia(24).catch(() => [] as IgPost[]), graphPosts(30).catch(() => [] as IgPost[])]);
  if (!all.length) return <Empty title="İçerik" sub="Paylaşım verisi gelmedi." />;
  const after = await ordersAfter(all);

  const groups = (["video", "image", "carousel"] as const)
    .map((f) => {
      const xs = all.filter((p) => (p.format ?? (p.type === "reel" ? "video" : "image")) === f);
      const avg = (k: "reach" | "saves" | "shares" | "interactions") => (xs.length ? xs.reduce((s, p) => s + p[k], 0) / xs.length : 0);
      return { f, n: xs.length, reach: avg("reach"), saves: avg("saves"), shares: avg("shares"), inter: avg("interactions") };
    })
    .filter((g) => g.n > 0);
  const best = [...groups].sort((a, b) => b.reach - a.reach)[0];

  const reels = all.filter((p) => p.type === "reel");

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <Eyebrow>Tür kıyası · son {all.length} paylaşım, ortalama</Eyebrow>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-mute">
                <th className="px-5 py-2 font-normal">Tür</th>
                <th className="px-2 py-2 text-right font-normal">Adet</th>
                <th className="px-2 py-2 text-right font-normal">Erişim</th>
                <th className="px-2 py-2 text-right font-normal">Kayıt</th>
                <th className="px-2 py-2 text-right font-normal">Paylaşım</th>
                <th className="px-5 py-2 text-right font-normal">Etkileşim</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {groups.map((g) => (
                <tr key={g.f} className={cx(g === best && "font-medium")}>
                  <td className="px-5 py-2.5 font-sans">{FORMAT[g.f]}</td>
                  <td className="px-2 py-2.5 text-right">{g.n}</td>
                  <td className="px-2 py-2.5 text-right">{compact(Math.round(g.reach))}</td>
                  <td className="px-2 py-2.5 text-right">{one(g.saves)}</td>
                  <td className="px-2 py-2.5 text-right">{one(g.shares)}</td>
                  <td className="px-5 py-2.5 text-right">{compact(Math.round(g.inter))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {groups.length > 1 && best && (
          <p className="mx-5 mt-2 mb-5 border-t border-line pt-4 text-[14px] leading-relaxed text-ink-2">
            En çok erişimi <b className="font-medium text-ink">{FORMAT[best.f]}</b> alıyor (ort. {compact(Math.round(best.reach))}). Kaydetme ve
            paylaşım, içeriğin değerli bulunduğunu gösterir; algoritma en çok bunlara bakar.
          </p>
        )}
      </Card>

      {reels.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            <Eyebrow>Reel karnesi</Eyebrow>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-mute">
                  <th className="px-5 py-2 font-normal">Reel</th>
                  <th className="px-2 py-2 text-right font-normal">İzlenme</th>
                  <th className="px-2 py-2 text-right font-normal">Ort. izleme</th>
                  <th className="px-2 py-2 text-right font-normal">Erişim</th>
                  <th className="px-2 py-2 text-right font-normal">Kayıt</th>
                  <th className="px-2 py-2 text-right font-normal">Paylaşım</th>
                  <th className="px-5 py-2 text-right font-normal">48s sipariş</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {reels.map((r) => {
                  const o = after.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-2.5">
                        <a href={r.url ?? undefined} target="_blank" className="flex max-w-[220px] items-center gap-2.5 font-sans">
                          <Thumb src={r.image} alt="" size={36} />
                          <span className="min-w-0">
                            <span className="block truncate">{r.caption || "Reel"}</span>
                            <span className="text-[11.5px] text-mute">{dayLabel(r.publishedAt)}</span>
                          </span>
                        </a>
                      </td>
                      <td className="px-2 py-2.5 text-right">{compact(r.views)}</td>
                      <td className="px-2 py-2.5 text-right">{r.avgWatchSec ? `${one(r.avgWatchSec)} sn` : "—"}</td>
                      <td className="px-2 py-2.5 text-right">{compact(r.reach)}</td>
                      <td className="px-2 py-2.5 text-right">{r.saves}</td>
                      <td className="px-2 py-2.5 text-right">{r.shares}</td>
                      <td className={cx("px-5 py-2.5 text-right", o?.n ? "text-ink" : "text-faint")}>
                        {o?.n ? `${o.n} · ${money(o.rev)}` : "0"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mx-5 mt-2 mb-5 border-t border-line pt-4 text-[12.5px] text-mute">
            Ortalama izleme süresi reel&apos;in ilk saniyeleri tutuyor mu gösterir. 3 sn altı: kanca zayıf.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <Eyebrow>Son içerikler · paylaşım sonrası 48 saat</Eyebrow>
        </div>
        <div className="divide-y divide-line">
          {recent.map((p) => {
            const o = after.get(p.id) ?? { n: 0, rev: 0 };
            return (
              <a key={p.id} href={p.url ?? undefined} target="_blank" className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                <Thumb src={p.image} alt="" size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{p.caption || (p.type === "reel" ? "Reel" : "Post")}</p>
                  <p className="text-[12px] text-mute">
                    {FORMAT[p.format ?? (p.type === "reel" ? "video" : "image")]} · {dateTime(p.publishedAt)}
                  </p>
                  <p className="num mt-0.5 text-[12px] text-ink-2">
                    {compact(p.reach)} erişim · {p.saves} kayıt · {p.shares} paylaşım
                    {p.profileVisits ? ` · ${p.profileVisits} profil` : ""}
                    {p.follows ? ` · +${p.follows} takip` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cx("num text-[15px] font-medium", o.n ? "text-ink" : "text-faint")}>{o.n} sipariş</p>
                  <p className="num text-[12px] text-mute">{o.n ? money(o.rev) : ""}</p>
                </div>
              </a>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story arşivi

export async function Stories() {
  await requireSession();
  const stories = await listStories(60);
  const avg = (k: "reach" | "views" | "replies") => (stories.length ? stories.reduce((s, x) => s + x[k], 0) / stories.length : 0);
  const exitRate = stories.length
    ? stories.reduce((s, x) => s + x.exits, 0) / Math.max(1, stories.reduce((s, x) => s + x.views, 0))
    : 0;
  const best = [...stories].sort((a, b) => b.reach - a.reach)[0];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Story arşivi</Eyebrow>
            <p className="mt-1 max-w-md text-[13px] text-mute">
              Instagram story verisini 24 saat sonra siler. Zamanlayıcı her 15 dakikada aktif story&apos;lerin son halini buraya yazar.
            </p>
          </div>
          <ActionButton action={snapshotStoriesAction}>Şimdi kaydet</ActionButton>
        </div>
        {stories.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Story" value={String(stories.length)} />
            <Stat label="Ort. erişim" value={compact(avg("reach"))} />
            <Stat label="Ort. yanıt" value={one(avg("replies"))} />
            <Stat label="Çıkış oranı" value={`%${Math.round(exitRate * 100)}`} />
          </div>
        )}
        {best && stories.length >= 3 && (
          <Insight>
            En çok erişen story {dayLabel(best.publishedAt)} tarihli ({compact(best.reach)} erişim). Çıkış oranı yüksekse story dizisi
            fazla uzun ya da ilk kare zayıf.
          </Insight>
        )}
      </Card>

      {stories.length === 0 ? (
        <Empty
          title="Henüz kayıt yok"
          sub="Story paylaşınca zamanlayıcı kaydetmeye başlar. Şu an aktif story varsa “Şimdi kaydet”e bas."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-mute">
                  <th className="px-5 py-2.5 font-normal">Story</th>
                  <th className="px-2 py-2.5 text-right font-normal">Erişim</th>
                  <th className="px-2 py-2.5 text-right font-normal">Yanıt</th>
                  <th className="px-2 py-2.5 text-right font-normal">İleri</th>
                  <th className="px-2 py-2.5 text-right font-normal">Geri</th>
                  <th className="px-2 py-2.5 text-right font-normal">Çıkış</th>
                  <th className="px-5 py-2.5 text-right font-normal">Profil / takip</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {stories.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5">
                      <a href={s.permalink ?? undefined} target="_blank" className="flex items-center gap-2.5 font-sans">
                        <Thumb src={s.image} alt="" size={36} label="ST" />
                        <span className="text-[12.5px] text-ink-2">{dateTime(s.publishedAt)}</span>
                      </a>
                    </td>
                    <td className="px-2 py-2.5 text-right">{compact(s.reach)}</td>
                    <td className="px-2 py-2.5 text-right">{s.replies}</td>
                    <td className="px-2 py-2.5 text-right">{s.tapsForward}</td>
                    <td className="px-2 py-2.5 text-right">{s.tapsBack}</td>
                    <td className="px-2 py-2.5 text-right">{s.exits}</td>
                    <td className="px-5 py-2.5 text-right">
                      {s.profileVisits} / {s.follows}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="num text-[22px] leading-none font-medium">{value}</p>
      <p className="mt-1 text-[12px] text-mute">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drop'lar

export async function Drops() {
  await requireSession();
  const drops = await listDrops();
  const reports = await Promise.all(drops.map((d) => dropReport(d).catch(() => null)));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Eyebrow>Drop takibi</Eyebrow>
            <p className="mt-1 max-w-md text-[13px] text-mute">
              Teaser&apos;ın başladığı gün ve lansman saatini gir; erişim, yeni takipçi ve sipariş teaser&apos;dan lansman sonrası 2 haftaya
              kadar tek grafikte, drop&apos;lar yan yana.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <DropForm startOpen={drops.length === 0} />
        </div>
      </Card>

      {drops.length > 1 && (
        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            <Eyebrow>Drop karşılaştırma</Eyebrow>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-mute">
                  <th className="px-5 py-2 font-normal">Drop</th>
                  <th className="px-2 py-2 text-right font-normal">Teaser erişim</th>
                  <th className="px-2 py-2 text-right font-normal">İlk hafta sipariş</th>
                  <th className="px-2 py-2 text-right font-normal">İlk hafta ciro</th>
                  <th className="px-5 py-2 text-right font-normal">Yeni takipçi</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-line">
                {drops.map((d, i) => {
                  const r = reports[i];
                  return (
                    <tr key={d.id}>
                      <td className="px-5 py-2.5 font-sans">{d.name}</td>
                      <td className="px-2 py-2.5 text-right">{r ? compact(r.teaser.reach) : "—"}</td>
                      <td className="px-2 py-2.5 text-right">{r ? r.launchWeek.orders : "—"}</td>
                      <td className="px-2 py-2.5 text-right">{r ? money(r.launchWeek.revenue) : "—"}</td>
                      <td className="px-5 py-2.5 text-right">{r ? `+${r.teaser.gained + r.launchWeek.gained}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {drops.map((d, i) => {
        const r = reports[i];
        return (
          <Card key={d.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-medium">{d.name}</p>
                <p className="text-[12.5px] text-mute">
                  Teaser {dayLabel(d.teaserAt)} · Lansman {dateTime(d.launchAt)}
                  {d.note ? ` · ${d.note}` : ""}
                </p>
              </div>
              <ActionButton action={deleteDropAction.bind(null, d.id)}>Sil</ActionButton>
            </div>
            {r ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label={`Teaser erişimi · ${r.teaser.days} gün`} value={compact(r.teaser.reach)} />
                  <Stat label="Teaser'da yeni takipçi" value={`+${r.teaser.gained}`} />
                  <Stat label="İlk hafta sipariş" value={String(r.launchWeek.orders)} />
                  <Stat label="İlk hafta ciro" value={money(r.launchWeek.revenue)} />
                </div>
                <div className="mt-5">
                  <DropChart days={r.days} />
                </div>
                <p className="mt-3 text-[12px] text-faint">
                  Instagram yeni takipçi verisini son 30 gün, Shopify siparişleri son 60 gün için veriyor; eski drop&apos;larda bu alanlar eksik
                  kalabilir.
                </p>
              </>
            ) : (
              <p className="mt-3 text-[14px] text-mute">Rapor hazırlanamadı.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
