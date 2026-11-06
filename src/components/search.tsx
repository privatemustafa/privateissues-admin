"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchAction } from "@/app/(app)/actions";
import { cx } from "./ui";

type Hit = { kind: string; title: string; sub?: string; href: string };
const KIND: Record<string, string> = { order: "Sipariş", product: "Depo", note: "Not", pr: "PR", expense: "Gider", page: "Sayfa" };

export function SearchButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ara"
        className={cx("flex h-10 items-center gap-2 rounded-full border border-line bg-card px-3.5 text-[13.5px] text-mute", className)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" strokeLinecap="round" />
        </svg>
        <span className="hidden lg:inline">Ara</span>
        <kbd className="hidden rounded-md border border-line px-1.5 text-[11px] lg:inline">⌘K</kbd>
      </button>
      {open && <Palette onClose={() => setOpen(false)} />}
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const run = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(() => start(async () => { setHits(await searchAction(v)); setSel(0); }), 180);
  };
  const go = (h: Hit) => {
    onClose();
    router.push(h.href);
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto mt-[10vh] w-[min(640px,92vw)] overflow-hidden rounded-3xl border border-line bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={q}
          onChange={(e) => run(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(hits.length - 1, s + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            }
            if (e.key === "Enter" && hits[sel]) go(hits[sel]);
          }}
          placeholder="Sipariş no, müşteri, ürün, not, @hesap, gider…"
          className="h-14 w-full bg-transparent px-5 text-[16px] outline-none"
        />
        <div className="max-h-[60vh] overflow-y-auto border-t border-line">
          {q.trim().length >= 2 && !pending && hits.length === 0 && <p className="px-5 py-4 text-[14px] text-mute">Bulunamadı.</p>}
          {hits.map((h, i) => (
            <button
              key={h.kind + h.href + h.title}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(h)}
              className={cx("flex w-full items-center gap-3 px-5 py-3 text-left", i === sel ? "bg-paper" : "")}
            >
              <span className="w-14 shrink-0 text-[11px] tracking-wide text-mute uppercase">{KIND[h.kind] ?? h.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px]">{h.title}</span>
                {h.sub && <span className="block truncate text-[12px] text-mute">{h.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
