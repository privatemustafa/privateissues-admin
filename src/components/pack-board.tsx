"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GalleryThumb } from "./gallery";
import { ShipButton, type ShipSummary } from "./ship-sheet";
import { CopyButton } from "./small";
import { Card, cx } from "./ui";

export type PickLine = {
  key: string;
  title: string;
  variant: string | null;
  images: string[];
  qty: number;
  orders: string[];
};

export type PackOrder = ShipSummary & { age: string; note: string | null; myNote: string | null };

const STORE = "pi:packed";

/** Paketleme modu: önce toplama listesi (raftan ne alınacak), sonra paket paket kargola. */
export function PackBoard({ picks, orders, carriers }: { picks: PickLine[]; orders: PackOrder[]; carriers: readonly string[] }) {
  const [tab, setTab] = useState<"pick" | "pack">("pick");
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, boolean>;
      // sadece hâlâ listede olanları tut
      const valid = new Set([...picks.map((p) => p.key), ...orders.map((o) => o.orderId)]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(Object.fromEntries(Object.entries(saved).filter(([k]) => valid.has(k))));
    } catch {}
  }, [picks, orders]);

  function toggle(k: string) {
    navigator.vibrate?.(12);
    setDone((d) => {
      const next = { ...d, [k]: !d[k] };
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const units = picks.reduce((s, p) => s + p.qty, 0);
  const picked = picks.filter((p) => done[p.key]).reduce((s, p) => s + p.qty, 0);
  const packed = orders.filter((o) => done[o.orderId]).length;
  const pct = tab === "pick" ? (units ? picked / units : 0) : orders.length ? packed / orders.length : 0;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 bg-paper/90 px-4 pt-1 pb-3 backdrop-blur md:static md:mx-0 md:px-0">
        <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-card p-1">
          {(
            [
              ["pick", `Toplama · ${units} adet`],
              ["pack", `Paketler · ${orders.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cx("h-9 rounded-full text-[13.5px] transition", tab === k ? "bg-ink font-medium text-paper" : "text-ink-2")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${pct * 100}%` }} />
          </div>
          <span className="num text-[12.5px] text-mute">
            {tab === "pick" ? `${picked}/${units}` : `${packed}/${orders.length}`}
          </span>
        </div>
      </div>

      {tab === "pick" ? (
        <div className="grid gap-2 md:grid-cols-2">
          {picks.map((p) => (
            <Card key={p.key} className={cx("flex min-w-0 items-center gap-2.5 p-2.5 transition sm:gap-3 sm:p-3", done[p.key] && "opacity-45")}>
              <GalleryThumb images={p.images} title={p.title} caption={p.variant ?? undefined} size={60} />
              <button onClick={() => toggle(p.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cx("truncate text-[15px] font-medium", done[p.key] && "line-through")}>{p.title}</p>
                  <p className="truncate text-[12.5px] text-mute">{p.orders.join(", ")}</p>
                </div>
                {p.variant && (
                  <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-paper px-2 text-[15px] font-semibold">
                    {p.variant}
                  </span>
                )}
                <span className="num shrink-0 text-right text-[20px] font-medium">×{p.qty}</span>
                <Check on={!!done[p.key]} />
              </button>
            </Card>
          ))}
          {!picks.length && <Empty />}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => (
            <Card key={o.orderId} className={cx("p-4 transition", done[o.orderId] && "opacity-45")}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => toggle(o.orderId)} className="flex items-center gap-3 text-left">
                  <Check on={!!done[o.orderId]} />
                  <div>
                    <p className="num text-[18px] leading-tight font-medium">
                      {o.orderName}
                      {o.express && (
                        <span className="ml-2 rounded-full bg-ink px-1.5 py-px align-middle text-[10px] text-paper">HIZLI</span>
                      )}
                    </p>
                    <p className="text-[12.5px] text-mute">{o.age} önce</p>
                  </div>
                </button>
                <ShipButton order={o} carriers={carriers} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {o.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-2 text-[14px]">
                    <span className="num w-6 text-mute">{it.qty}×</span>
                    <span className="flex-1 truncate">{it.title}</span>
                    {it.variant && (
                      <span className="rounded-md border border-line px-1.5 text-[12px] font-semibold">{it.variant}</span>
                    )}
                  </li>
                ))}
              </ul>
              {(o.note || o.myNote) && (
                <div className="mt-3 space-y-1 rounded-xl bg-due/10 p-2.5 text-[13px]">
                  {o.note && <p>Müşteri: {o.note}</p>}
                  {o.myNote && <p>Not: {o.myNote}</p>}
                </div>
              )}
              <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-paper p-3">
                <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{o.address}</p>
                <CopyButton text={o.address} />
              </div>
              <Link href={`/orders/${encodeURIComponent(o.orderId)}?status=open`} className="mt-2 block text-[12.5px] text-mute">
                Detay →
              </Link>
            </Card>
          ))}
          {!orders.length && <Empty />}
        </div>
      )}
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={cx(
        "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition",
        on ? "border-ink bg-ink text-paper" : "border-sand",
      )}
    >
      {on && (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function Empty() {
  return <p className="col-span-full py-14 text-center text-[15px] text-mute">Paketlenecek bir şey yok.</p>;
}
