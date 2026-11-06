"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FulfillForm, type FulfillTarget } from "./fulfill-form";
import { SmartImg } from "./img";
import { CopyButton } from "./small";
import { cx } from "./ui";

export type ShipSummary = FulfillTarget & {
  items: { title: string; variant: string | null; qty: number; image: string | null }[];
  address: string;
  express: boolean;
};

/** Panelden/paket listesinden sayfa değiştirmeden kargolamak için alttan açılan panel. */
export function ShipButton({
  order,
  carriers,
  className,
  label = "Kargola",
}: {
  order: ShipSummary;
  carriers: readonly string[];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          navigator.vibrate?.(15);
          setOpen(true);
        }}
        className={cx(
          "shrink-0 rounded-full bg-ink px-3.5 py-2 text-[13px] font-medium text-paper transition active:scale-[0.96]",
          className,
        )}
      >
        {label}
      </button>
      {open && <Sheet order={order} carriers={carriers} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({ order, carriers, onClose }: { order: ShipSummary; carriers: readonly string[]; onClose: () => void }) {
  const router = useRouter();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setShown(false);
    setTimeout(() => {
      onClose();
      router.refresh();
    }, 220);
  }

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-end justify-center md:items-center" role="dialog" aria-modal>
      <div
        onClick={close}
        className={cx("absolute inset-0 bg-ink/35 backdrop-blur-[2px] transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")}
      />
      <div
        className={cx(
          "relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-ink p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-paper shadow-2xl transition-transform duration-300 ease-[var(--ease-out-soft)] md:rounded-[28px]",
          shown ? "translate-y-0" : "translate-y-full md:translate-y-8",
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-paper/25 md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-paper/55 uppercase">Kargoya ver</p>
            <p className="num mt-1 text-[24px] leading-none font-medium tracking-tight">
              {order.orderName}
              {order.express && (
                <span className="ml-2 rounded-full bg-paper px-1.5 py-0.5 align-middle text-[10px] text-ink">HIZLI</span>
              )}
            </p>
          </div>
          <button onClick={close} className="h-8 rounded-full border border-paper/20 px-3 text-[12.5px]">
            Kapat
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {order.items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-paper/[0.06] p-2">
              <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-paper/10">
                <SmartImg src={it.image} alt={it.title} label={it.title} className="size-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium">{it.title}</p>
                <p className="text-[13px] text-paper/65">
                  {it.variant && (
                    <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-paper px-1 text-[11.5px] font-semibold text-ink">
                      {it.variant}
                    </span>
                  )}
                  × {it.qty}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {order.address && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl bg-paper/[0.06] p-3">
            <p className="text-[13px] leading-relaxed whitespace-pre-line text-paper/80">{order.address}</p>
            <div className="[&_button]:border-paper/20 [&_button]:text-paper">
              <CopyButton text={order.address} />
            </div>
          </div>
        )}

        <div className="mt-5">
          <FulfillForm target={order} carriers={carriers} bare onDone={close} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
