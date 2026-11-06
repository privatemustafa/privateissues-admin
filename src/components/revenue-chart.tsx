"use client";

import { useMemo, useRef, useState } from "react";
import { cx } from "./ui";

type P = { day: string; orders: number; revenue: number };

const fmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const money = (n: number) => `${fmt.format(Math.round(n))} ₺`;
const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", weekday: "short", timeZone: "Europe/Istanbul" });
const label = (d: string) => dayFmt.format(new Date(d + "T12:00:00+03:00"));

const RANGES = [7, 30, 90] as const;

/** Parmağını çubukların üstünde gezdir → o günün cirosu; üstten 7/30/90 gün seç. */
export function RevenueChart({ points }: { points: P[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const { data, prev } = useMemo(() => {
    const data = points.slice(-range);
    const prev = points.slice(-range * 2, -range);
    return { data, prev };
  }, [points, range]);

  const sum = (xs: P[], k: "revenue" | "orders") => xs.reduce((s, p) => s + p[k], 0);
  const total = sum(data, metric);
  const prevTotal = sum(prev, metric);
  const delta = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null;
  const orders = sum(data, "orders");
  const revenue = sum(data, "revenue");
  const max = Math.max(1, ...data.map((p) => p[metric]));
  const sel = hover != null ? data[hover] : null;

  function pick(clientX: number) {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * data.length);
    const idx = Math.max(0, Math.min(data.length - 1, i));
    if (idx !== hover) navigator.vibrate?.(4);
    setHover(idx);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-paper p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setHover(null);
              }}
              className={cx(
                "h-7 rounded-full px-3 text-[12.5px] transition",
                range === r ? "bg-card font-medium shadow-[0_0_0_1px_var(--color-line)]" : "text-mute",
              )}
            >
              {r}g
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-paper p-0.5">
          {(
            [
              ["revenue", "Ciro"],
              ["orders", "Sipariş"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={cx(
                "h-7 rounded-full px-3 text-[12.5px] transition",
                metric === k ? "bg-card font-medium shadow-[0_0_0_1px_var(--color-line)]" : "text-mute",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex min-h-[64px] items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-mute">{sel ? label(sel.day) : `Son ${range} gün`}</p>
          <p className="num text-[34px] leading-none font-medium tracking-[-0.04em]">
            {sel ? (metric === "revenue" ? money(sel.revenue) : sel.orders) : metric === "revenue" ? money(total) : total}
          </p>
        </div>
        <div className="text-right">
          {sel ? (
            <p className="num text-[13px] text-ink-2">
              {metric === "revenue" ? `${sel.orders} sipariş` : money(sel.revenue)}
            </p>
          ) : delta != null ? (
            <>
              <p className={cx("num text-[13px] font-medium", delta >= 0 ? "text-fresh" : "text-late")}>
                {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
              </p>
              <p className="text-[11.5px] text-faint">önceki {range} güne göre</p>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={box}
        className="relative mt-4 h-[132px] touch-none select-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(e) => e.pointerType !== "mouse" && setTimeout(() => setHover(null), 1600)}
      >
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((p, i) => {
            const v = p[metric];
            const h = v ? Math.max(3, (v / max) * 120) : 2;
            const isLast = i === data.length - 1;
            const active = hover === i;
            return (
              <div key={p.day} className="flex h-full flex-1 items-end">
                <div
                  className={cx(
                    "w-full rounded-[3px] transition-[height,background-color] duration-300",
                    active ? "bg-ink" : hover != null ? "bg-sand/70" : isLast ? "bg-ink" : v ? "bg-sand" : "bg-line",
                  )}
                  style={{ height: h }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{label(data[0].day)}</span>
        <span>bugün</span>
      </div>

      <div className="mt-5 grid grid-cols-3 border-t border-line pt-4 text-center">
        <Mini label="Sipariş" value={String(orders)} />
        <Mini label="Sepet ort." value={orders ? money(revenue / orders) : "—"} />
        <Mini label="Günlük ort." value={money(revenue / range)} />
      </div>
    </div>
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
