import { compact, dayLabel } from "@/lib/format";

type Bar = { day: string; value: number; label?: string };

/** Günlük ciro/sipariş çubukları — bugün koyu, diğerleri kum rengi. */
export function DailyBars({ data, height = 120, format = compact }: { data: Bar[]; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {data.map((d, i) => {
          const h = d.value ? Math.max(2, (d.value / max) * (height - 16)) : 1.2;
          const isLast = i === data.length - 1;
          return (
            <rect
              key={d.day}
              x={i * w + w * 0.18}
              y={height - h}
              width={w * 0.64}
              height={h}
              rx={0.6}
              fill={isLast ? "var(--color-ink)" : d.value ? "var(--color-sand)" : "var(--color-line)"}
            >
              <title>{`${dayLabel(d.day + "T12:00:00+03:00")}: ${d.label ?? format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{dayLabel(data[0].day + "T12:00:00+03:00")}</span>
        {peak.value > 0 && (
          <span className="text-mute">
            zirve {dayLabel(peak.day + "T12:00:00+03:00")} · {peak.label ?? format(peak.value)}
          </span>
        )}
        <span>bugün</span>
      </div>
    </div>
  );
}

/** Instagram erişimi (çizgi) + siparişler (çubuk) aynı eksende. */
export function ReachVsOrders({
  data,
  height = 160,
}: {
  data: { day: string; reach: number; orders: number }[];
  height?: number;
}) {
  const maxR = Math.max(1, ...data.map((d) => d.reach));
  const maxO = Math.max(1, ...data.map((d) => d.orders));
  const w = 100 / data.length;
  const pad = 10;
  const line = data
    .map((d, i) => {
      const x = i * w + w / 2;
      const y = height - pad - (d.reach / maxR) * (height - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = d.orders ? Math.max(3, (d.orders / maxO) * (height * 0.45)) : 0;
          return (
            <rect key={d.day} x={i * w + w * 0.22} y={height - h} width={w * 0.56} height={h} rx={0.5} fill="var(--color-sand)">
              <title>{`${dayLabel(d.day + "T12:00:00+03:00")}: ${d.orders} sipariş · ${compact(d.reach)} erişim`}</title>
            </rect>
          );
        })}
        <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11.5px] text-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-ink" /> Erişim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-sand" /> Sipariş
        </span>
      </div>
    </div>
  );
}

export function Sparkline({ values, height = 36 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 100).toFixed(2)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={d} fill="none" stroke="var(--color-ink)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
