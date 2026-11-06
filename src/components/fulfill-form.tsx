"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { fulfillAction } from "@/app/(app)/actions";
import { BarcodeScanner, scannerSupported } from "./scanner";
import { cx } from "./ui";

const LAST_CARRIER = "pi:last-carrier";

export type FulfillTarget = {
  orderId: string;
  orderName: string;
  customerFirst: string;
  wa: string | null;
};

export function FulfillForm({
  target,
  carriers,
  autoFocus,
  onDone,
  bare,
}: {
  target: FulfillTarget;
  carriers: readonly string[];
  autoFocus?: boolean;
  onDone?: () => void;
  /** Sheet içinde kullanılırken dış kart olmadan */
  bare?: boolean;
}) {
  const [state, action, pending] = useActionState(fulfillAction, undefined);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [carrier, setCarrier] = useState(carriers[0]);
  const [tracking, setTracking] = useState("");
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan(scannerSupported());
    const last = localStorage.getItem(LAST_CARRIER);
    if (last && carriers.includes(last)) setCarrier(last);
  }, [carriers]);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => input.current?.focus(), 350);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (state?.ok) {
      navigator.vibrate?.([40, 30, 80]);
      try {
        localStorage.setItem(LAST_CARRIER, carrier);
      } catch {}
    }
  }, [state, carrier]);

  const onScan = useCallback((code: string) => {
    setTracking(code);
    setScanning(false);
  }, []);

  const shell = cx("text-paper", !bare && "rounded-[var(--radius-card)] bg-ink p-5");

  if (state?.ok) {
    const msg = `Merhaba ${target.customerFirst}, Private Issues siparişin ${target.orderName} kargoya verildi.${
      tracking ? ` ${carrier} takip no: ${tracking}` : ""
    } İyi günlerde giy.`;
    return (
      <div ref={ref} className={shell}>
        <div className="flex items-center gap-3">
          <span className="animate-in flex size-10 items-center justify-center rounded-full bg-paper text-ink">✓</span>
          <div>
            <p className="text-[17px] font-medium">{target.orderName} kargolandı</p>
            <p className="text-[13px] text-paper/60">
              {carrier}
              {tracking && ` · ${tracking}`}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {target.wa && (
            <a
              href={`https://wa.me/${target.wa}?text=${encodeURIComponent(msg)}`}
              target="_blank"
              className="h-11 flex-1 rounded-2xl bg-paper px-4 text-center text-[14px] leading-[44px] font-medium text-ink"
            >
              WhatsApp&apos;tan haber ver
            </a>
          )}
          {onDone && (
            <button onClick={onDone} className="h-11 flex-1 rounded-2xl border border-paper/25 px-4 text-[14px] font-medium">
              Tamam
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} id="ship" className={shell}>
      {!bare && <p className="text-[11px] tracking-[0.16em] text-paper/55 uppercase">Kargoya ver</p>}
      <form action={action} className={cx("space-y-3", !bare && "mt-4")}>
        <input type="hidden" name="orderId" value={target.orderId} />
        <input type="hidden" name="company" value={carrier} />
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {carriers.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCarrier(c)}
              className={cx(
                "h-9 shrink-0 rounded-full border px-3.5 text-[13px] transition",
                c === carrier ? "border-paper bg-paper font-medium text-ink" : "border-paper/20 text-paper/80",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            ref={input}
            name="tracking"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            autoComplete="off"
            placeholder="Takip numarası (opsiyonel)"
            className="num h-12 min-w-0 flex-1 rounded-2xl border border-paper/15 bg-paper/5 px-4 text-[16px] text-paper outline-none placeholder:text-paper/40 focus:border-paper/60"
          />
          {canScan && (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border border-paper/20 px-3.5 text-[13px] font-medium"
              aria-label="Barkod okut"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" strokeLinecap="round" />
                <path d="M8 9v6M11 9v6M14 9v6M16.5 9v6" strokeLinecap="round" />
              </svg>
              Okut
            </button>
          )}
        </div>
        <label className="flex items-center gap-2.5 py-1 text-[14px] text-paper/80">
          <input type="checkbox" name="notify" defaultChecked className="size-4 accent-paper" />
          Müşteriye kargo e-postası gönder
        </label>
        <button
          disabled={pending}
          className={cx(
            "h-12 w-full rounded-2xl bg-paper text-[15px] font-medium text-ink transition active:scale-[0.99]",
            pending && "opacity-60",
          )}
        >
          {pending ? "Kargolanıyor…" : "Kargolandı olarak işaretle"}
        </button>
        {state?.message && !state.ok && <p className="text-[13px] text-[#f2a58e]">{state.message}</p>}
      </form>
      {scanning && <BarcodeScanner onResult={onScan} onClose={() => setScanning(false)} />}
    </div>
  );
}
