import { Suspense } from "react";
import { requireSession } from "@/lib/auth";
import { GIVE_UP_AFTER_DAYS, knownHandles, prItemOptions, prOverview, reminderLink, REMIND_AFTER_DAYS } from "@/lib/pr";
import { compact, dayLabel, money } from "@/lib/format";
import { Card, Eyebrow, PageHeader, Skeleton, Thumb, cx } from "@/components/ui";
import { ActionButton } from "@/components/small";
import { PersonEdit, PrSendForm, SendActions } from "@/components/pr";
import { prScanAction } from "../actions";

export const metadata = { title: "PR" };

export default function PrPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="PR" sub="Kime ne gönderdik, ne döndü" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

const STATUS = {
  waiting: { label: "Bekleniyor", cls: "bg-due/12 text-due" },
  posted: { label: "Paylaştı", cls: "bg-fresh/12 text-fresh" },
  no_post: { label: "Paylaşmadı", cls: "bg-late/10 text-late" },
} as const;

async function Content() {
  await requireSession();
  const [{ rows, totals }, options, known] = await Promise.all([prOverview(), prItemOptions(), knownHandles()]);
  const rate = totals.sends ? Math.round((totals.posted / totals.sends) * 100) : 0;
  const ranked = [...rows].sort((a, b) => b.code.revenue + b.after.revenue - (a.code.revenue + a.after.revenue) || b.likes - a.likes);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PrSendForm options={options} known={known} startOpen={rows.length === 0} />
        <p className="mt-3 text-[12.5px] text-mute">
          Kaydedince ürünler depodan düşer. Kişinin hesabı her 6 saatte taranır; Private Issues geçen paylaşımı otomatik bulunur ve
          bildirim gelir. {REMIND_AFTER_DAYS} gün içinde paylaşım yoksa hatırlatılır.
        </p>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Gönderim" value={String(totals.sends)} sub={`${totals.people} kişi · ${totals.units} ürün`} />
            <Kpi label="Paylaşım oranı" value={`%${rate}`} sub={`${totals.posted} paylaştı · ${totals.waiting} bekliyor`} />
            <Kpi label="Ürün maliyeti" value={totals.cost ? money(totals.cost) : "—"} sub={totals.cost ? undefined : "Depoda maliyet girilirse hesaplanır"} />
            <Kpi
              label="Getirdiği satış"
              value={money(totals.codeRevenue + totals.afterRevenue)}
              sub={`kod ${money(totals.codeRevenue)} · paylaşım sonrası ${money(totals.afterRevenue)}`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <Eyebrow>Kişiler · en çok getirenden</Eyebrow>
            <ActionButton action={prScanAction}>Şimdi tara</ActionButton>
          </div>

          <div className="space-y-3">
            {ranked.map((r) => (
              <Card key={r.person.id} className="p-4 md:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <Thumb src={r.person.avatar} alt="" size={52} label={r.person.handle.slice(0, 2).toUpperCase()} className="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <a href={`https://instagram.com/${r.person.handle}`} target="_blank" className="text-[16px] font-medium">
                      @{r.person.handle}
                    </a>
                    <p className="text-[12.5px] text-mute">
                      {[
                        r.person.name,
                        r.person.followers != null ? `${compact(r.person.followers)} takipçi` : null,
                        r.person.category,
                        r.person.code ? `kod ${r.person.code}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.person.scanError && <p className="mt-0.5 text-[12px] text-faint">{r.person.scanError}</p>}
                    <div className="mt-1">
                      <PersonEdit id={r.person.id} name={r.person.name} phone={r.person.phone} code={r.person.code} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right">
                    <Mini label="beğeni" value={compact(r.likes)} />
                    <Mini label="kodla sipariş" value={r.person.code ? String(r.code.n) : "—"} />
                    <Mini label="48s sonrası" value={r.after.n ? `${r.after.n} · ${money(r.after.revenue)}` : "0"} />
                  </div>
                </div>

                {r.posts.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    {r.posts.map((p) => (
                      <a key={p.id} href={p.permalink ?? undefined} target="_blank" className="w-28 shrink-0">
                        <Thumb src={p.image} alt="" size={112} label={p.mediaType === "STORY" ? "ST" : "IG"} />
                        <p className="num mt-1 text-[11.5px] text-ink-2">
                          {p.likes != null ? `${compact(p.likes)} ♥` : p.source === "manual" ? "elle eklendi" : ""}
                          {p.comments ? ` · ${p.comments} yorum` : ""}
                        </p>
                        <p className="text-[11px] text-faint">{dayLabel(p.postedAt)}</p>
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-4 divide-y divide-line border-t border-line">
                  {r.sends.map((s) => {
                    const days = Math.floor((Date.now() - +s.sentAt) / 86_400_000);
                    const st = STATUS[s.status];
                    return (
                      <div key={s.id} className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cx("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", st.cls)}>
                            {st.label}
                            {s.status === "waiting" ? ` · ${days} gün` : ""}
                          </span>
                          <span className="text-[13px] text-ink-2">{dayLabel(s.sentAt)}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {s.items.map((i) => `${i.product}${i.variant ? ` ${i.variant}` : ""}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}
                          </span>
                          {s.status === "waiting" && days >= 3 && (
                            <a
                              href={reminderLink(r.person, s.items.map((i) => i.product))}
                              target="_blank"
                              className="h-8 rounded-full bg-ink px-3 text-[12.5px] leading-8 text-paper"
                            >
                              {r.person.phone ? "WhatsApp'tan hatırlat" : "DM'den hatırlat"}
                            </a>
                          )}
                        </div>
                        {s.note && <p className="text-[12.5px] text-mute">{s.note}</p>}
                        <SendActions id={s.id} status={s.status} />
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          <p className="px-1 text-[12px] text-faint">
            Otomatik bulma yalnızca işletme / içerik üreticisi hesaplarında ve paylaşımın açıklamasında Private Issues geçtiğinde çalışır.
            Story&apos;ler API&apos;ye kapalı; story paylaşanlarda &quot;Paylaşım linki ekle&quot;yi kullan. {GIVE_UP_AFTER_DAYS} gün içinde
            paylaşım olmazsa gönderim &quot;paylaşmadı&quot;ya düşer.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="num mt-2 text-[24px] leading-none font-medium">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-mute">{sub}</p>}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="num text-[15px] font-medium">{value}</p>
      <p className="text-[11px] text-mute">{label}</p>
    </div>
  );
}
