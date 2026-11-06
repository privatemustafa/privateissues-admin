"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Latest = {
  id: string;
  name: string;
  total: number;
  customerName: string | null;
  image: string | null;
  title: string | null;
};

const fmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

/**
 * Uygulama açıkken yeni siparişi anında gösterir:
 * - service worker'dan gelen push mesajlarını dinler
 * - ayrıca 20 sn'de bir /api/live'ı yoklar (push kapalıysa bile çalışsın)
 */
export function LiveWatcher() {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const [toast, setToast] = useState<Latest | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    let stop = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { latest: Latest | null; pending: number };
        if ("setAppBadge" in navigator) {
          (d.pending ? navigator.setAppBadge(d.pending) : navigator.clearAppBadge()).catch(() => {});
        }
        if (!d.latest) return;
        if (last.current && last.current !== d.latest.id) {
          setToast(d.latest);
          navigator.vibrate?.([60, 30, 60]);
          router.refresh();
        }
        last.current = d.latest.id;
      } catch {}
    }

    poll();
    const t = setInterval(() => !stop && poll(), 20_000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);

    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "push") {
        router.refresh();
        poll();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);

    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.removeEventListener("message", onMsg);
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(12px,env(safe-area-inset-top))]">
      <Link
        href={`/orders/${encodeURIComponent(toast.id)}`}
        onClick={() => setToast(null)}
        className="animate-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[22px] bg-ink p-2.5 pr-4 text-paper shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]"
      >
        <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-ink-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {toast.image && <img src={toast.image} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.14em] text-paper/60 uppercase">Yeni sipariş</p>
          <p className="truncate text-[16px] font-medium">
            {toast.name} · {fmt.format(toast.total)} ₺
          </p>
          <p className="truncate text-[13px] text-paper/70">
            {toast.title} — {toast.customerName}
          </p>
        </div>
        <span className="text-[13px] font-medium">Aç →</span>
      </Link>
    </div>
  );
}
