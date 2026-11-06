"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StockProduct, StockVariant } from "@/lib/shopify/actions";
import { setStockAction } from "@/app/(app)/actions";
import { GalleryThumb } from "./gallery";
import { Card, cx } from "./ui";

type Filter = "all" | "low" | "out";

export function StockBoard({
  products,
  low,
  sold,
}: {
  products: StockProduct[];
  low: number;
  sold: Record<string, number>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const min = (p: StockProduct) => Math.min(...p.variants.map((v) => v.qty));
    return products
      .filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()))
      .filter((p) =>
        filter === "all" ? true : filter === "out" ? p.variants.some((v) => v.qty <= 0) : p.variants.some((v) => v.qty <= low),
      )
      .sort((a, b) => min(a) - min(b));
  }, [products, filter, q, low]);

  const counts = {
    low: products.filter((p) => p.variants.some((v) => v.qty <= low && v.qty > 0)).length,
    out: products.filter((p) => p.variants.some((v) => v.qty <= 0)).length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "Tümü", products.length],
            ["low", "Azalan", counts.low],
            ["out", "Tükenen", counts.out],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cx(
              "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] transition",
              filter === k ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-2",
            )}
          >
            {label}
            <span className={cx("num text-[12px]", filter === k ? "text-paper/60" : "text-faint")}>{n}</span>
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün ara…"
          className="ml-auto h-9 w-full rounded-full border border-line bg-card px-4 text-[14px] outline-none focus:border-ink sm:w-56"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((p) => (
          <ProductCard key={p.id} p={p} low={low} sold={sold[p.title] ?? 0} />
        ))}
      </div>
      {!list.length && <p className="py-10 text-center text-[14px] text-mute">Bu filtrede ürün yok.</p>}
    </div>
  );
}

function ProductCard({ p, low, sold }: { p: StockProduct; low: number; sold: number }) {
  const [editing, setEditing] = useState<string | null>(null);
  const total = p.variants.reduce((s, v) => s + Math.max(0, v.qty), 0);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <GalleryThumb images={p.images} title={p.title} caption={`${total} adet stokta`} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{p.title}</p>
          <p className="text-[12.5px] text-mute">
            {total} adet{sold ? ` · 30 günde ${sold} satış` : ""}
            {sold > 0 && total > 0 && ` · ~${Math.max(1, Math.round((total / sold) * 30))} günlük stok`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.variants.map((v) => (
          <VariantChip
            key={v.id}
            v={v}
            low={low}
            open={editing === v.id}
            onToggle={() => setEditing(editing === v.id ? null : v.id)}
          />
        ))}
      </div>
      {editing && (
        <Editor
          key={editing}
          v={p.variants.find((v) => v.id === editing)!}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function VariantChip({ v, low, open, onToggle }: { v: StockVariant; low: number; open: boolean; onToggle: () => void }) {
  const tone = v.qty <= 0 ? "out" : v.qty <= low ? "low" : "ok";
  return (
    <button
      onClick={onToggle}
      disabled={!v.inventoryItemId || !v.locationId}
      className={cx(
        "flex min-w-[60px] flex-col items-center rounded-xl border px-2.5 py-1.5 transition active:scale-[0.96]",
        open && "ring-2 ring-ink",
        tone === "out" && "border-critical/30 bg-critical/5",
        tone === "low" && "border-late/30 bg-late/5",
        tone === "ok" && "border-line bg-paper",
      )}
    >
      <span className="text-[11.5px] text-mute">{v.title}</span>
      <span
        className={cx(
          "num text-[17px] leading-tight font-medium",
          tone === "out" && "text-critical",
          tone === "low" && "text-late",
        )}
      >
        {v.qty}
      </span>
    </button>
  );
}

function Editor({ v, onClose }: { v: StockVariant; onClose: () => void }) {
  const router = useRouter();
  const start = v.available ?? v.qty;
  const [n, setN] = useState(start);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const step = (d: number) => {
    navigator.vibrate?.(8);
    setN((x) => Math.max(0, x + d));
  };

  return (
    <div className="animate-in mt-3 rounded-2xl bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-mute">
          <b className="font-medium text-ink">{v.title}</b> bedeni
        </span>
        <div className="flex items-center gap-1.5">
          <Step onClick={() => step(-1)}>−</Step>
          <input
            inputMode="numeric"
            value={n}
            onChange={(e) => setN(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
            className="num h-10 w-16 rounded-xl border border-line bg-card text-center text-[18px] font-medium outline-none focus:border-ink"
          />
          <Step onClick={() => step(1)}>+</Step>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[5, 10, 25].map((k) => (
          <button key={k} onClick={() => step(k)} className="h-8 rounded-full border border-line bg-card px-3 text-[12.5px]">
            +{k}
          </button>
        ))}
        <button onClick={() => setN(0)} className="h-8 rounded-full border border-line bg-card px-3 text-[12.5px]">
          Sıfırla
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={pending || n === start}
          onClick={() =>
            run(async () => {
              const r = await setStockAction({
                inventoryItemId: v.inventoryItemId!,
                locationId: v.locationId!,
                quantity: n,
                from: v.available,
              });
              setMsg(r.message ?? null);
              if (r.ok) {
                navigator.vibrate?.([20, 20, 40]);
                router.refresh();
                setTimeout(onClose, 700);
              }
            })
          }
          className="h-10 flex-1 rounded-full bg-ink text-[14px] font-medium text-paper disabled:opacity-40"
        >
          {pending ? "Kaydediliyor…" : n === start ? "Değişiklik yok" : `${start} → ${n} olarak kaydet`}
        </button>
        <button onClick={onClose} className="h-10 rounded-full border border-line px-4 text-[13px]">
          Vazgeç
        </button>
      </div>
      {msg && <p className="mt-2 text-[12.5px] text-mute">{msg}</p>}
    </div>
  );
}

function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-xl border border-line bg-card text-[20px] leading-none transition active:scale-90"
    >
      {children}
    </button>
  );
}
