"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { StockMove, WarehouseItem } from "@/db/schema";
import {
  depoDeleteAction,
  depoDismissAction,
  depoLinkAction,
  depoMoveAction,
  depoUpdateAction,
} from "@/app/(app)/actions";
import { GalleryThumb } from "./gallery";
import { SmartImg } from "./img";
import { Card, Eyebrow, cx } from "./ui";

type Filter = "all" | "low" | "out";
type Group = { key: string; product: string; color: string | null; category: string | null; collection: string | null; image: string | null; items: WarehouseItem[] };

const SIZE_ORDER = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "2xl", "xxxl", "3xl", "4xl"];
const sizeRank = (v: string | null) => {
  const i = SIZE_ORDER.indexOf((v ?? "").toLowerCase());
  return i >= 0 ? i : 100 + (Number(v) || 0);
};

export function DepoBoard({
  items,
  low,
  shopify,
  initialQuery,
}: {
  items: WarehouseItem[];
  low: number;
  /** shopifyVariantId → Shopify'daki adet (karşılaştırma için) */
  shopify: Record<string, number>;
  initialQuery?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState(initialQuery ?? "");
  const [open, setOpen] = useState<number | null>(null);
  const collections = [...new Set([...items].sort((a, b) => a.id - b.id).map((i) => i.collection).filter(Boolean))] as string[];
  const [col, setCol] = useState<string | null>(null);

  const minOf = (i: WarehouseItem) => i.minQty ?? low;
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const it of items) {
      const k = `${it.product}|${it.color ?? ""}`;
      const g = m.get(k) ?? { key: k, product: it.product, color: it.color, category: it.category, collection: it.collection, image: it.image, items: [] };
      g.image ??= it.image;
      g.items.push(it);
      m.set(k, g);
    }
    const ql = q.toLocaleLowerCase("tr-TR");
    return [...m.values()]
      .map((g) => ({ ...g, items: g.items.sort((a, b) => sizeRank(a.variant) - sizeRank(b.variant)) }))
      .filter((g) => !col || g.collection === col)
      .filter((g) => !ql || `${g.product} ${g.color ?? ""} ${g.items.map((i) => `${i.sku ?? ""} ${i.location ?? ""}`).join(" ")}`.toLocaleLowerCase("tr-TR").includes(ql))
      .filter((g) =>
        filter === "all"
          ? true
          : filter === "out"
            ? g.items.some((i) => i.qty <= 0)
            : g.items.some((i) => i.qty > 0 && i.qty <= minOf(i)),
      )
      .sort((a, b) => Math.min(...a.items.map((i) => i.qty - minOf(i))) - Math.min(...b.items.map((i) => i.qty - minOf(i))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, filter, low, col]);

  // Filtre yokken sezonlara göre bölümle (yeni sezon önce)
  const sections =
    col || collections.length < 2
      ? [{ name: null as string | null, groups }]
      : [...collections, null]
          .map((c) => ({ name: c ?? "Diğer", groups: groups.filter((g) => (g.collection ?? null) === c) }))
          .filter((s) => s.groups.length);

  const counts = {
    low: items.filter((i) => i.qty > 0 && i.qty <= minOf(i)).length,
    out: items.filter((i) => i.qty <= 0).length,
  };
  const selected = items.find((i) => i.id === open) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "Tümü", items.length],
            ["low", "Azalan", counts.low],
            ["out", "Biten", counts.out],
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
          placeholder="Ürün, kod, raf ara…"
          className="h-9 w-full rounded-full border border-line bg-card px-4 text-[14px] outline-none focus:border-ink sm:ml-auto sm:w-60"
        />
      </div>

      {collections.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          {[null, ...collections].map((c) => {
            const n = items.filter((i) => !c || i.collection === c).reduce((s, i) => s + Math.max(0, i.qty), 0);
            return (
              <button
                key={c ?? "all"}
                onClick={() => setCol(c)}
                className={cx(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition",
                  col === c ? "bg-sand font-medium text-ink" : "text-mute",
                )}
              >
                {c ?? "Tümü"}
                <span className="num text-faint">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {sections.map((sec) => (
        <section key={sec.name ?? "all"} className="space-y-2">
          {sec.name && (
            <div className="flex items-baseline justify-between px-1 pt-2">
              <h2 className="text-[13px] font-medium tracking-[0.12em] text-ink-2 uppercase">{sec.name}</h2>
              <span className="num text-[12px] text-mute">
                {sec.groups.length} ürün · {sec.groups.reduce((s, g) => s + g.items.reduce((a, i) => a + Math.max(0, i.qty), 0), 0)} adet
              </span>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {sec.groups.map((g) => {
          const total = g.items.reduce((s, i) => s + Math.max(0, i.qty), 0);
          const shared = new Set(g.items.map((i) => i.location).filter(Boolean));
          return (
            <Card key={g.key} className="p-4">
              <div className="flex items-center gap-3">
                <GalleryThumb images={g.image ? [g.image] : []} title={g.product} size={60} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{g.product}</p>
                  <p className="truncate text-[12.5px] text-mute">
                    {[g.color, g.category, `${total} adet`, shared.size === 1 ? `Raf ${[...shared][0]}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.items.map((it) => {
                  const tone = it.qty <= 0 ? "out" : it.qty <= minOf(it) ? "low" : "ok";
                  const shop = it.shopifyVariantId ? shopify[it.shopifyVariantId] : undefined;
                  const diff = shop != null && shop !== it.qty;
                  return (
                    <button
                      key={it.id}
                      onClick={() => setOpen(open === it.id ? null : it.id)}
                      className={cx(
                        "relative flex min-w-[62px] flex-col items-center rounded-xl border px-2.5 py-1.5 transition active:scale-[0.96]",
                        open === it.id && "ring-2 ring-ink",
                        tone === "out" && "border-critical/30 bg-critical/5",
                        tone === "low" && "border-late/30 bg-late/5",
                        tone === "ok" && "border-line bg-paper",
                      )}
                    >
                      <span className="text-[11.5px] text-mute">{it.variant ?? "Tek"}</span>
                      <span
                        className={cx(
                          "num text-[18px] leading-tight font-medium",
                          tone === "out" && "text-critical",
                          tone === "low" && "text-late",
                        )}
                      >
                        {it.qty}
                      </span>
                      {diff && (
                        <span className="num mt-0.5 rounded-full bg-due/15 px-1.5 text-[9.5px] font-medium text-due" title="Shopify'daki adet">
                          S:{shop}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selected && g.items.some((i) => i.id === selected.id) && (
                <ItemEditor key={selected.id} item={selected} onClose={() => setOpen(null)} />
              )}
            </Card>
          );
        })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="py-10 text-center text-[14px] text-mute">Bu filtrede ürün yok.</p>}
      {Object.keys(shopify).length > 0 && (
        <p className="text-[12px] text-faint">
          <span className="rounded-full bg-due/15 px-1.5 text-[10px] font-medium text-due">S:31</span> = Shopify&apos;daki adet depodan
          farklı.
        </p>
      )}
    </div>
  );
}

type Mode = "in" | "out" | "pr" | "count" | "return" | "info";

function ItemEditor({ item, onClose }: { item: WarehouseItem; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [n, setN] = useState(mode === "count" ? item.qty : 1);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const [loc, setLoc] = useState(item.location ?? "");
  const [min, setMin] = useState(item.minQty?.toString() ?? "");
  const [cost, setCost] = useState(item.cost?.toString() ?? "");
  const [sku, setSku] = useState(item.sku ?? "");

  const tabs: [Mode, string][] = [
    ["in", "Giriş"],
    ["out", "Çıkış"],
    ["pr", "PR"],
    ["count", "Sayım"],
    ["return", "İade"],
    ["info", "Bilgi"],
  ];
  const after = mode === "count" ? n : mode === "out" || mode === "pr" ? item.qty - n : item.qty + n;

  function switchMode(m: Mode) {
    setMode(m);
    setN(m === "count" ? item.qty : 1);
    setMsg(null);
  }

  function save() {
    run(async () => {
      const r =
        mode === "info"
          ? await depoUpdateAction(item.id, {
              location: loc.trim() || null,
              minQty: min === "" ? null : Math.max(0, Number(min) || 0),
              cost: cost === "" ? null : Number(cost.replace(",", ".")) || null,
              sku: sku.trim() || null,
            })
          : await depoMoveAction({
              itemId: item.id,
              reason: mode === "in" ? "restock" : mode === "out" ? "out" : mode === "pr" ? "pr" : mode === "count" ? "count" : "return",
              ...(mode === "count" ? { setTo: n } : { delta: mode === "out" || mode === "pr" ? -n : n }),
              note: note.trim() || undefined,
            });
      setMsg({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) {
        navigator.vibrate?.([20, 20, 40]);
        setTimeout(onClose, 650);
      }
    });
  }

  return (
    <div className="animate-in mt-3 rounded-2xl bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px]">
          <b className="font-medium">{item.variant ?? "Tek beden"}</b>
          <span className="text-mute"> · elde {item.qty}</span>
          {item.location && <span className="text-mute"> · {item.location}</span>}
        </p>
        <button onClick={onClose} className="text-[12.5px] text-mute">
          Kapat
        </button>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-0.5 rounded-full bg-card p-0.5 shadow-[0_0_0_1px_var(--color-line)]">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            onClick={() => switchMode(k)}
            className={cx("h-8 rounded-full text-[12px] transition", mode === k ? "bg-ink font-medium text-paper" : "text-ink-2")}
          >
            {l}
          </button>
        ))}
      </div>

      {mode === "info" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Raf / konum" value={loc} onChange={setLoc} placeholder="A3" />
          <Field label="Kod (SKU)" value={sku} onChange={setSku} />
          <Field label="Uyarı eşiği" value={min} onChange={setMin} placeholder="genel" inputMode="numeric" />
          <Field label="Maliyet ₺" value={cost} onChange={setCost} inputMode="decimal" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Step onClick={() => setN((x) => Math.max(0, x - 1))}>−</Step>
            <input
              inputMode="numeric"
              value={n}
              onChange={(e) => setN(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
              className="num h-12 w-20 rounded-xl border border-line bg-card text-center text-[22px] font-medium outline-none focus:border-ink"
            />
            <Step onClick={() => setN((x) => x + 1)}>+</Step>
          </div>
          {mode !== "count" && (
            <div className="mt-2 flex justify-center gap-1.5">
              {[5, 10, 25, 50].map((k) => (
                <button key={k} onClick={() => setN((x) => x + k)} className="h-7 rounded-full border border-line bg-card px-2.5 text-[12px]">
                  +{k}
                </button>
              ))}
            </div>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              mode === "in" ? "Not: atölyeden geldi, 2. üretim…" : mode === "pr" ? "Kime: isim / hesap (zorunlu değil)" : mode === "out" ? "Not: numune, fire…" : mode === "return" ? "Not: sipariş no, neden…" : "Not (opsiyonel)"
            }
            className="mt-3 h-10 w-full rounded-xl border border-line bg-card px-3 text-[14px] outline-none focus:border-ink"
          />
          <p className="num mt-2 text-center text-[12.5px] text-mute">
            {item.qty} → <b className={cx("font-medium", after < 0 ? "text-critical" : "text-ink")}>{after}</b>
          </p>
        </>
      )}

      <div className="mt-3 flex gap-2">
        <button
          disabled={pending || (mode !== "info" && (mode === "count" ? n === item.qty : n === 0))}
          onClick={save}
          className="h-10 flex-1 rounded-full bg-ink text-[14px] font-medium text-paper disabled:opacity-40"
        >
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {mode === "info" && (
          <button
            onClick={() => {
              if (confirm(`${item.product} ${item.variant ?? ""} depodan silinsin mi?`)) run(async () => void (await depoDeleteAction(item.id)));
            }}
            className="h-10 rounded-full border border-line px-4 text-[13px] text-late"
          >
            Sil
          </button>
        )}
      </div>
      {msg?.text && <p className={cx("mt-2 text-center text-[12.5px]", msg.ok ? "text-mute" : "text-late")}>{msg.text}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <label className="block">
      <span className="text-[11.5px] text-mute">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-0.5 h-10 w-full rounded-xl border border-line bg-card px-3 text-[14px] outline-none focus:border-ink"
      />
    </label>
  );
}

function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        navigator.vibrate?.(8);
        onClick();
      }}
      className="flex size-12 items-center justify-center rounded-xl border border-line bg-card text-[22px] leading-none transition active:scale-90"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function UnmatchedBox({ moves, items }: { moves: StockMove[]; items: WarehouseItem[] }) {
  if (!moves.length) return null;
  return (
    <Card className="border-due/40 p-4">
      <Eyebrow className="text-due">Depoda karşılığı olmayan satırlar · {moves.length}</Eyebrow>
      <p className="mt-1 text-[13px] text-mute">
        Bu siparişler depodan düşülemedi. Doğru ürünü seç — bir dahakine otomatik eşleşir.
      </p>
      <ul className="mt-3 space-y-2">
        {moves.map((m) => (
          <UnmatchedRow key={m.id} m={m} items={items} />
        ))}
      </ul>
    </Card>
  );
}

function UnmatchedRow({ m, items }: { m: StockMove; items: WarehouseItem[] }) {
  const [sel, setSel] = useState("");
  const [pending, run] = useTransition();
  const t = (m.meta?.title ?? "").toLocaleLowerCase("tr-TR");
  const sorted = [...items].sort((a, b) => {
    const sa = a.product.toLocaleLowerCase("tr-TR") === t ? 0 : 1;
    const sb = b.product.toLocaleLowerCase("tr-TR") === t ? 0 : 1;
    return sa - sb || a.product.localeCompare(b.product);
  });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2">
      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-cream">
        <SmartImg src={m.meta?.image} alt="" label={m.meta?.title} className="size-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">
          {m.meta?.title} {m.meta?.variant && <span className="text-mute">· {m.meta.variant}</span>} ×{m.meta?.quantity}
        </p>
        <Link href={`/orders/${encodeURIComponent(m.ref ?? "")}?status=all`} className="text-[12px] text-mute">
          {m.refName}
        </Link>
      </div>
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="h-9 max-w-[52%] rounded-lg border border-line bg-card px-2 text-[13px]"
      >
        <option value="">Depodaki ürünü seç…</option>
        {sorted.map((i) => (
          <option key={i.id} value={i.id}>
            {[i.product, i.color, i.variant].filter(Boolean).join(" · ")} ({i.qty})
          </option>
        ))}
      </select>
      <button
        disabled={!sel || pending}
        onClick={() => run(async () => void (await depoLinkAction(m.id, Number(sel))))}
        className="h-9 rounded-full bg-ink px-3 text-[12.5px] font-medium text-paper disabled:opacity-40"
      >
        Düş
      </button>
      <button
        disabled={pending}
        onClick={() => run(async () => void (await depoDismissAction(m.id)))}
        className="h-9 rounded-full border border-line px-3 text-[12.5px]"
      >
        Yok say
      </button>
    </li>
  );
}
