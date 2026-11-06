import type { ReactNode } from "react";
import Link from "next/link";
import { urgency, urgencyLabel, type Urgency } from "@/lib/format";
import { SmartImg } from "./img";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-[var(--radius-card)] border border-line bg-card", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className, lang }: { children: ReactNode; className?: string; lang?: string }) {
  return (
    <p lang={lang} className={cx("text-[11px] font-medium tracking-[0.16em] text-mute uppercase", className)}>
      {children}
    </p>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 pt-2 pb-5 md:pt-6">
      <div>
        <h1 className="text-[30px] leading-[1.05] font-medium tracking-[-0.03em] md:text-[36px]">{title}</h1>
        {sub && <div className="mt-1.5 text-[14px] text-mute">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export const urgencyColor: Record<Urgency, string> = {
  fresh: "var(--color-fresh)",
  due: "var(--color-due)",
  late: "var(--color-late)",
  critical: "var(--color-critical)",
};

export function UrgencyBadge({ createdAt, method }: { createdAt: Date; method?: string | null }) {
  const u = urgency(createdAt, method);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: urgencyColor[u], background: `color-mix(in srgb, ${urgencyColor[u]} 10%, transparent)` }}
    >
      <span
        className={cx("size-1.5 rounded-full", u !== "fresh" && "animate-pulse-dot")}
        style={{ background: urgencyColor[u] }}
      />
      {urgencyLabel[u]}
    </span>
  );
}

const statusMap: Record<string, { label: string; tone: "ink" | "mute" | "warn" | "ok" }> = {
  UNFULFILLED: { label: "Kargolanmadı", tone: "warn" },
  PARTIALLY_FULFILLED: { label: "Kısmen kargolandı", tone: "warn" },
  FULFILLED: { label: "Kargolandı", tone: "ok" },
  IN_PROGRESS: { label: "Hazırlanıyor", tone: "warn" },
  ON_HOLD: { label: "Beklemede", tone: "warn" },
  RESTOCKED: { label: "Stoğa iade", tone: "mute" },
  PAID: { label: "Ödendi", tone: "ok" },
  PENDING: { label: "Ödeme bekliyor", tone: "warn" },
  REFUNDED: { label: "İade edildi", tone: "mute" },
  PARTIALLY_REFUNDED: { label: "Kısmi iade", tone: "mute" },
  VOIDED: { label: "İptal", tone: "mute" },
  AUTHORIZED: { label: "Onaylandı", tone: "ink" },
};

export function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const s = statusMap[status] ?? { label: status.toLowerCase(), tone: "mute" as const };
  const tone = {
    ink: "border-ink/15 text-ink",
    mute: "border-line text-mute",
    warn: "border-due/30 text-due",
    ok: "border-fresh/25 text-fresh",
  }[s.tone];
  return <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>{s.label}</span>;
}

export function Thumb({ src, alt, size = 48, className, label }: { src: string | null; alt: string; size?: number; className?: string; label?: string }) {
  return (
    <div
      className={cx("shrink-0 overflow-hidden rounded-xl border border-line bg-cream", className)}
      style={{ width: size, height: size }}
    >
      <SmartImg src={src} alt={alt} label={label ?? alt} className="size-full" />
    </div>
  );
}

export function Delta({ now, prev, suffix = "" }: { now: number; prev: number; suffix?: string }) {
  if (!prev) return <span className="text-[12px] text-faint">—</span>;
  const d = ((now - prev) / prev) * 100;
  const up = d >= 0;
  return (
    <span className={cx("num text-[12px] font-medium", up ? "text-fresh" : "text-late")}>
      {up ? "↑" : "↓"} {Math.abs(d).toFixed(0)}%{suffix}
    </span>
  );
}

export function EmptyState({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[17px] font-medium">{title}</p>
      {sub && <p className="mt-1 max-w-xs text-[14px] text-mute">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "solid", className }: { href: string; children: ReactNode; variant?: "solid" | "ghost"; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-[14px] font-medium transition active:scale-[0.98]",
        variant === "solid" ? "bg-ink text-paper" : "border border-line bg-card text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}
