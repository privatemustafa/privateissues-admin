"use client";

import { useActionState, useEffect, useRef } from "react";
import { fulfillAction } from "@/app/(app)/actions";
import { cx } from "./ui";

export function FulfillForm({
  orderId,
  carriers,
  autoFocus,
  defaultCarrier,
}: {
  orderId: string;
  carriers: readonly string[];
  autoFocus?: boolean;
  defaultCarrier?: string;
}) {
  const [state, action, pending] = useActionState(fulfillAction, undefined);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => input.current?.focus(), 350);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (state?.ok) navigator.vibrate?.(40);
  }, [state]);

  return (
    <div ref={ref} id="ship" className="rounded-[var(--radius-card)] bg-ink p-5 text-paper">
      <p className="text-[11px] tracking-[0.16em] text-paper/55 uppercase">Kargoya ver</p>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <div className="flex flex-wrap gap-1.5">
          {carriers.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="company"
                value={c}
                defaultChecked={defaultCarrier ? c === defaultCarrier : i === 0}
                className="peer sr-only"
              />
              <span className="inline-flex h-8 items-center rounded-full border border-paper/20 px-3 text-[13px] text-paper/80 transition peer-checked:border-paper peer-checked:bg-paper peer-checked:text-ink">
                {c}
              </span>
            </label>
          ))}
        </div>
        <input
          ref={input}
          name="tracking"
          inputMode="text"
          autoComplete="off"
          placeholder="Takip numarası (opsiyonel)"
          className="h-12 w-full rounded-2xl border border-paper/15 bg-paper/5 px-4 text-[16px] text-paper outline-none placeholder:text-paper/40 focus:border-paper/60"
        />
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
        {state?.message && (
          <p className={cx("text-[13px]", state.ok ? "text-paper" : "text-[#f2a58e]")}>{state.message}</p>
        )}
      </form>
    </div>
  );
}
