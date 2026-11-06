import Link from "next/link";
import type { Order } from "@/db/schema";
import { ago, firstName, hoursSince, isExpress, money, urgency } from "@/lib/format";
import { Thumb, UrgencyBadge, StatusPill, cx, urgencyColor } from "./ui";

function itemsText(o: Order) {
  const [a] = o.lineItems;
  if (!a) return "";
  return `${a.title}${a.variantTitle ? ` · ${a.variantTitle}` : ""}${o.lineItems.length > 1 ? `  +${o.lineItems.length - 1}` : ""}`;
}

export function OrderRow({ o, href, active }: { o: Order; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "flex items-center gap-3 px-4 py-3 transition",
        active ? "bg-cream" : "hover:bg-paper",
      )}
    >
      <Thumb src={o.lineItems[0]?.image ?? null} alt="" size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="num text-[15px] font-medium">{o.name}</span>
          {o.needsShipping ? (
            <UrgencyBadge createdAt={o.createdAt} method={o.shippingMethod} />
          ) : o.cancelledAt ? (
            <StatusPill status="VOIDED" />
          ) : (
            <StatusPill status={o.fulfillmentStatus} />
          )}
        </div>
        <p className="truncate text-[13px] text-mute">
          {firstName(o.customerName)} — {itemsText(o)}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-[15px] font-medium">{money(o.total, o.currency)}</p>
        <p className="text-[12px] text-faint">{ago(o.createdAt)}</p>
      </div>
    </Link>
  );
}

/** Panelin yıldızı: kargolanmayı bekleyen paketler, aciliyet çubuğuyla. */
export function PendingTile({ o }: { o: Order }) {
  const u = urgency(o.createdAt, o.shippingMethod);
  const hours = hoursSince(o.createdAt) * (isExpress(o.shippingMethod) ? 2 : 1);
  const pct = Math.min(100, (hours / 48) * 100);
  const color = urgencyColor[u];
  const href = `/orders/${encodeURIComponent(o.id)}?status=open`;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        <Thumb src={o.lineItems[0]?.image ?? null} alt="" size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="num text-[16px] font-medium">{o.name}</span>
            <span className="truncate text-[13px] text-mute">{firstName(o.customerName)}</span>
            {isExpress(o.shippingMethod) && (
              <span className="rounded-full bg-ink px-1.5 py-px text-[10px] font-medium text-paper">HIZLI</span>
            )}
          </div>
          <p className="truncate text-[13px] text-ink-2">{itemsText(o)}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-cream">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="num shrink-0 text-[11.5px] font-medium" style={{ color }}>
              {ago(o.createdAt)}
            </span>
          </div>
        </div>
      </Link>
      <Link
        href={`${href}&ship=1#ship`}
        className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-paper transition active:scale-[0.97]"
      >
        Kargola
      </Link>
    </div>
  );
}
