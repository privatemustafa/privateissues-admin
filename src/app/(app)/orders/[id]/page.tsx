import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getOrder } from "@/lib/data";
import { CARRIERS } from "@/lib/carriers";
import { addressText as fmtAddress, itemImages, shipSummary, waNumber } from "@/lib/ship";
import { GalleryThumb } from "@/components/gallery";
import { legacyId, storeAdminUrl } from "@/lib/shopify/client";
import { dateTime, isExpress, money, waitedFor } from "@/lib/format";
import { Card, Eyebrow, Skeleton, StatusPill, UrgencyBadge } from "@/components/ui";
import { FulfillForm } from "@/components/fulfill-form";
import { CopyButton, NoteEditor } from "@/components/small";
import { OrderList, type OrdersSearch } from "../list";

type Search = OrdersSearch & { ship?: string };

async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const data = await getOrder(decodeURIComponent(id));
  if (!data) notFound();
  const { order: o, note, history } = data;
  const a = o.shippingAddress;
  const addressText = fmtAddress(o);
  const wa = waNumber(a?.phone ?? o.customerPhone);
  const first = (o.customerName ?? "").split(" ")[0];
  const subtotal = o.lineItems.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const invoiced = o.tags.some((t) => /fatura oluşturuldu/i.test(t));
  const invoiceError = o.tags.some((t) => /fatura hatal/i.test(t));

  return (
    <div className="space-y-4">
      <Link href={`/orders?status=${sp.status ?? "open"}`} className="inline-block text-[14px] text-mute md:hidden">
        ← Siparişler
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="num text-[34px] leading-none font-medium tracking-[-0.04em]">{o.name}</h1>
          {o.needsShipping && <UrgencyBadge createdAt={o.createdAt} method={o.shippingMethod} />}
          {o.cancelledAt ? <StatusPill status="VOIDED" /> : <StatusPill status={o.fulfillmentStatus} />}
          <StatusPill status={o.financialStatus} />
        </div>
        <p className="mt-2 text-[14px] text-mute">
          {dateTime(o.createdAt)}
          {o.needsShipping && <> · {waitedFor(o.createdAt)} bekliyor</>}
          {o.fulfilledAt && <> · kargolandı {dateTime(o.fulfilledAt)}</>}
        </p>
      </header>

      {o.needsShipping && (
        <FulfillForm target={shipSummary(o)} carriers={CARRIERS} autoFocus={sp.ship === "1"} />
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Ürünler</Eyebrow>
          <span className="text-[13px] text-mute">{o.itemCount} adet</span>
        </div>
        <ul className="mt-3 space-y-3">
          {o.lineItems.map((li, i) => (
            <li key={i} className="flex items-center gap-3">
              <GalleryThumb
                images={itemImages(li)}
                title={li.title}
                caption={[li.variantTitle, `${li.quantity} adet`].filter(Boolean).join(" · ")}
                size={84}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">{li.title}</p>
                <p className="text-[13.5px] text-ink-2">
                  {li.variantTitle && (
                    <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line px-1.5 text-[12.5px] font-medium">
                      {li.variantTitle}
                    </span>
                  )}
                  {li.quantity} × {money(li.unitPrice)}
                </p>
                {li.inventoryQuantity != null && (
                  <p className="mt-0.5 text-[12px] text-faint">stokta {li.inventoryQuantity} kaldı</p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[14px]">
          <Row k="Ara toplam" v={money(subtotal)} />
          {subtotal - o.total > 1 && (
            <Row k={`İndirim${o.discountCodes.length ? ` (${o.discountCodes.join(", ")})` : ""}`} v={`−${money(subtotal - o.total)}`} />
          )}
          <Row
            k="Kargo"
            v={
              <span className="flex items-center gap-1.5">
                {o.shippingMethod ?? "—"}
                {isExpress(o.shippingMethod) && (
                  <span className="rounded-full bg-ink px-1.5 py-px text-[10px] font-medium text-paper">HIZLI</span>
                )}
              </span>
            }
          />
          <div className="flex justify-between pt-1 text-[17px] font-medium">
            <dt>Toplam</dt>
            <dd className="num">{money(o.total, o.currency)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <Eyebrow>Müşteri</Eyebrow>
        <p className="mt-2 text-[18px] font-medium">{o.customerName ?? "—"}</p>
        <p className="text-[13px] text-mute">
          {o.customerOrderCount && o.customerOrderCount > 1 ? `${o.customerOrderCount}. siparişi — sadık müşteri` : "İlk siparişi"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {wa && (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Merhaba ${first}, Private Issues ${o.name} siparişin hakkında yazıyorum.`)}`}
              className="h-9 rounded-full bg-ink px-4 text-[13px] leading-9 font-medium text-paper"
            >
              WhatsApp
            </a>
          )}
          {(a?.phone ?? o.customerPhone) && (
            <a href={`tel:${a?.phone ?? o.customerPhone}`} className="h-9 rounded-full border border-line px-4 text-[13px] leading-9 font-medium">
              Ara
            </a>
          )}
          {o.customerEmail && (
            <a href={`mailto:${o.customerEmail}`} className="h-9 rounded-full border border-line px-4 text-[13px] leading-9 font-medium">
              E-posta
            </a>
          )}
        </div>
        {a && (
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] leading-relaxed whitespace-pre-line">{addressText}</p>
              <CopyButton text={addressText} />
            </div>
          </div>
        )}
      </Card>

      {(o.tracking.length > 0 || o.tags.length > 0 || o.note) && (
        <Card className="space-y-3 p-5">
          {o.tracking.filter((t) => t.number || t.company).map((t, i) => (
            <div key={i}>
              <Eyebrow>Kargo takip</Eyebrow>
              <p className="mt-1 text-[15px]">
                {t.company} {t.number && <span className="num font-medium">{t.number}</span>}
              </p>
              {t.url && (
                <a href={t.url} target="_blank" className="text-[13px] text-mute underline">
                  Takip sayfası
                </a>
              )}
            </div>
          ))}
          {(invoiced || invoiceError) && (
            <div>
              <Eyebrow>Fatura</Eyebrow>
              <p className="mt-1 text-[14px]">
                {invoiceError ? (
                  <span className="text-late">Faturada hata işaretli — kontrol et</span>
                ) : (
                  <span className="text-fresh">Fatura oluşturuldu</span>
                )}
              </p>
            </div>
          )}
          {o.note && (
            <div>
              <Eyebrow>Müşteri notu</Eyebrow>
              <p className="mt-1 text-[14px] whitespace-pre-line">{o.note}</p>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <Eyebrow className="mb-3">Benim notum</Eyebrow>
        <NoteEditor orderId={o.id} initial={note} />
      </Card>

      {history.length > 0 && (
        <Card className="p-5">
          <Eyebrow>Önceki siparişleri</Eyebrow>
          <ul className="mt-2 divide-y divide-line">
            {history.map((h) => (
              <li key={h.id}>
                <Link href={`/orders/${encodeURIComponent(h.id)}?status=all`} className="flex justify-between py-2.5 text-[14px]">
                  <span className="num font-medium">{h.name}</span>
                  <span className="text-mute">{dateTime(h.createdAt)}</span>
                  <span className="num">{money(h.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <a
        href={storeAdminUrl(`/orders/${legacyId(o.id)}`)}
        target="_blank"
        className="block py-2 text-center text-[13px] text-mute"
      >
        Shopify&apos;da aç ↗
      </a>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-mute">{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}

async function SideList({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await requireSession();
  const { id } = await params;
  return <OrderList search={await searchParams} activeId={decodeURIComponent(id)} />;
}

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const sp = searchParams as Promise<Search>;
  return (
    <div className="mx-auto max-w-6xl md:pt-6">
      <div className="md:grid md:grid-cols-[minmax(300px,360px)_1fr] md:gap-5 lg:grid-cols-[minmax(340px,420px)_1fr] lg:gap-6">
        <div className="hidden md:block">
          <Suspense fallback={<Skeleton className="h-96" />}>
            <SideList params={params} searchParams={sp} />
          </Suspense>
        </div>
        <div className="pt-1 md:pt-0">
          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-64" />
              </div>
            }
          >
            <Detail params={params} searchParams={sp} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
