import { compact, dayLabel } from "@/lib/format";
import { cx } from "./ui";

/** Yatay çubuk listesi; isteğe bağlı ikinci (karşılaştırma) çubuğu ile. Değerler yüzde olarak verilir. */
export function BarList({
  rows,
  legend,
}: {
  rows: { label: string; pct: number; compare?: number | null; display?: string }[];
  legend?: [string, string];
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.pct, r.compare ?? 0]));
  return (
    <div>
      {legend && (
        <div className="mb-3 flex items-center gap-4 text-[11.5px] text-mute">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-ink" /> {legend[0]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-sand" /> {legend[1]}
          </span>
        </div>
      )}
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-[13px]">{r.label}</span>
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.max(1.5, (r.pct / max) * 100)}%` }} />
              {r.compare !== undefined && (
                <div
                  className={cx("h-2 rounded-full", r.compare ? "bg-sand" : "bg-line")}
                  style={{ width: `${Math.max(1.5, ((r.compare ?? 0) / max) * 100)}%` }}
                />
              )}
            </div>
            <span className="num text-right text-[12.5px] text-ink-2">
              {r.display ?? `%${Math.round(r.pct)}`}
              {r.compare !== undefined && <span className="text-mute"> · %{Math.round(r.compare ?? 0)}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 24 saatlik çubuk; en yoğun 3 saat koyu. */
export function HourBars({ values, height = 110 }: { values: number[]; height?: number }) {
  const max = Math.max(1, ...values);
  const top = [...values].map((v, h) => ({ v, h })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.h);
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {values.map((v, h) => (
          <div
            key={h}
            title={`${String(h).padStart(2, "0")}:00 · ${compact(v)} takipçi çevrimiçi`}
            className={cx("flex-1 rounded-t-[3px]", top.includes(h) ? "bg-ink" : "bg-sand")}
            style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="num mt-1.5 flex justify-between text-[11px] text-faint">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

/** Tek yatay çubukta parçalar + yüzdeli açıklama. */
export function SplitBar({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const tones = ["bg-ink", "bg-sand", "bg-line", "bg-mute"];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-line">
        {parts.map((p, i) => (
          <div key={p.label} className={tones[i % tones.length]} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-1.5 text-ink-2">
            <span className={cx("size-2.5 rounded-sm", tones[i % tones.length])} />
            {p.label} <b className="num font-medium text-ink">%{Math.round((p.value / total) * 100)}</b>
            <span className="num text-mute">· {compact(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Drop grafiği: teaser dönemi gölgeli, lansman günü dikey çizgi; erişim çizgi, sipariş çubuk. */
export function DropChart({
  days,
  height = 150,
}: {
  days: { day: string; reach: number; orders: number; phase: "teaser" | "launch" | "after" }[];
  height?: number;
}) {
  if (!days.length) return null;
  const maxR = Math.max(1, ...days.map((d) => d.reach));
  const maxO = Math.max(1, ...days.map((d) => d.orders));
  const w = 100 / days.length;
  const pad = 10;
  const teaserEnd = days.findIndex((d) => d.phase !== "teaser");
  const launch = days.findIndex((d) => d.phase === "launch");
  const line = days
    .map((d, i) => `${i ? "L" : "M"}${(i * w + w / 2).toFixed(2)},${(height - pad - (d.reach / maxR) * (height - pad * 2)).toFixed(2)}`)
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {teaserEnd !== 0 && (
          <rect x={0} y={0} width={(teaserEnd < 0 ? days.length : teaserEnd) * w} height={height} fill="var(--color-paper)" />
        )}
        {launch >= 0 && (
          <line
            x1={launch * w + w / 2}
            x2={launch * w + w / 2}
            y1={0}
            y2={height}
            stroke="var(--color-late)"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {days.map((d, i) => {
          const h = d.orders ? Math.max(3, (d.orders / maxO) * (height * 0.45)) : 0;
          return (
            <rect key={d.day} x={i * w + w * 0.22} y={height - h} width={w * 0.56} height={h} rx={0.5} fill="var(--color-sand)">
              <title>{`${dayLabel(d.day + "T12:00:00+03:00")}: ${d.orders} sipariş · ${compact(d.reach)} erişim`}</title>
            </rect>
          );
        })}
        <path d={line} fill="none" stroke="var(--color-ink)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11.5px] text-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-ink" /> Erişim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-sand" /> Sipariş
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-line bg-paper" /> Teaser
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0 border-l border-dashed border-late" /> Lansman
        </span>
      </div>
    </div>
  );
}
