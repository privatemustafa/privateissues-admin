"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

const items: { href: string; label: string; icon: (p: P) => React.ReactNode; badge?: boolean; mobile?: boolean }[] = [
  { href: "/", label: "Panel", icon: IconHome, mobile: true },
  { href: "/orders", label: "Siparişler", icon: IconBox, badge: true, mobile: true },
  { href: "/depo", label: "Depo", icon: IconShelf, mobile: true },
  { href: "/stock", label: "Shopify stok", icon: IconStack },
  { href: "/instagram", label: "Instagram", icon: IconSpark, mobile: true },
  { href: "/pr", label: "PR", icon: IconGift },
  { href: "/notlar", label: "Notlar", icon: IconCheck, mobile: true },
  { href: "/settings", label: "Ayarlar", icon: IconDial, mobile: true },
];

export function Nav({ badge }: { badge: ReactNode }) {
  return <NavView badge={badge} path={usePathname()} />;
}

/** Statik iskelet (pathname henüz yokken) ve gerçek menü aynı görünümü kullanır. */
export function NavView({ badge, path }: { badge: ReactNode; path: string | null }) {
  const active = (href: string) => path != null && (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <>
      {/* Fold açık / tablet / masaüstü: sol ray */}
      <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-line px-3 py-6 md:flex lg:w-[208px] lg:px-4">
        <Link href="/" className="px-2">
          <p lang="en" className="hidden text-[11px] tracking-[0.18em] text-mute uppercase lg:block">Private Issues</p>
          <p className="hidden text-[20px] leading-tight font-medium tracking-tight lg:block">admin</p>
          <p className="text-[17px] font-medium tracking-tight lg:hidden">PI</p>
        </Link>
        <nav className="mt-8 flex flex-col gap-0.5">
          {items.map(({ href, label, icon: Icon, badge: hasBadge }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={cx(
                "relative flex h-11 items-center justify-center gap-3 rounded-xl px-2.5 text-[14px] transition lg:h-10 lg:justify-start",
                active(href) ? "bg-card font-medium text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-cream",
              )}
            >
              <Icon className="size-[20px] lg:size-[18px]" />
              <span className="hidden flex-1 lg:inline">{label}</span>
              {hasBadge && <span className="absolute top-0.5 right-0.5 lg:static">{badge}</span>}
            </Link>
          ))}
        </nav>
        <p className="mt-auto hidden px-2 text-[11px] text-faint lg:block">privateissues.admin</p>
      </aside>

      {/* Fold kapalı / telefon: alt sekme çubuğu */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-6">
          {items.filter((i) => i.mobile).map(({ href, label, icon: Icon, badge: hasBadge }) => (
            <Link
              key={href}
              href={href}
              className={cx(
                "relative flex flex-col items-center justify-center gap-1 text-[10.5px]",
                active(href) ? "text-ink" : "text-mute",
              )}
            >
              <span className="relative">
                <Icon className="size-[21px]" />
                {hasBadge && <span className="absolute -top-1.5 -right-3">{badge}</span>}
              </span>
              <span className={cx(active(href) && "font-medium")}>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

type P = { className?: string };
function IconHome({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 10.5 12 4l8 6.5V20H4z" strokeLinejoin="round" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
function IconBox({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" strokeLinejoin="round" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  );
}
function IconStack({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="4" y="4" width="16" height="5" rx="1.5" />
      <rect x="4" y="11" width="16" height="5" rx="1.5" />
      <path d="M6 20h12" strokeLinecap="round" />
    </svg>
  );
}
function IconShelf({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M3.5 20V9l8.5-5 8.5 5v11" strokeLinejoin="round" />
      <path d="M7 20v-7h10v7M7 16.5h10" />
    </svg>
  );
}
function IconSpark({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="0.8" fill="currentColor" />
    </svg>
  );
}
function IconGift({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="3.5" y="8.5" width="17" height="12" rx="2" />
      <path d="M3.5 12.5h17M12 8.5v12" />
      <path d="M12 8.5c-1.5-3.5-5.5-4-5.5-1.5S12 8.5 12 8.5zm0 0c1.5-3.5 5.5-4 5.5-1.5S12 8.5 12 8.5z" strokeLinejoin="round" />
    </svg>
  );
}
function IconCheck({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="M8 12.5l2.5 2.5 5.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconDial({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}
