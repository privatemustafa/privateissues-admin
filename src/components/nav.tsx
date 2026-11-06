"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cx } from "./ui";
import { SearchButton } from "./search";

const items: { href: string; label: string; icon: (p: P) => React.ReactNode; badge?: boolean; mobile?: boolean }[] = [
  { href: "/", label: "Panel", icon: IconHome, mobile: true },
  { href: "/orders", label: "Siparişler", icon: IconBox, badge: true, mobile: true },
  { href: "/depo", label: "Depo", icon: IconShelf, mobile: true },
  { href: "/stock", label: "Shopify stok", icon: IconStack },
  { href: "/instagram", label: "Instagram", icon: IconSpark, mobile: true },
  { href: "/pr", label: "PR", icon: IconGift },
  { href: "/notlar", label: "Notlar", icon: IconCheck, mobile: true },
  { href: "/giderler", label: "Giderler", icon: IconCoin },
  { href: "/kodlar", label: "Kodlar", icon: IconTag },
  { href: "/reklam", label: "Reklam", icon: IconMegaphone },
  { href: "/settings", label: "Ayarlar", icon: IconDial },
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
        <div className="mt-5">
          <SearchButton className="w-full justify-center lg:justify-start" />
        </div>
        <nav className="mt-4 flex flex-col gap-0.5">
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
          <MoreTab items={items.filter((i) => !i.mobile)} active={active} />
        </div>
      </nav>
    </>
  );
}

function MoreTab({ items: rest, active }: { items: typeof items; active: (h: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const isActive = rest.some((i) => active(i.href));
  return (
    <>
      <button onClick={() => setOpen(true)} className={cx("relative flex flex-col items-center justify-center gap-1 text-[10.5px]", isActive ? "text-ink" : "text-mute")}>
        <IconMore className="size-[21px]" />
        <span className={cx(isActive && "font-medium")}>Daha</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/30" onClick={() => setOpen(false)}>
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper p-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3">
              <SearchButton className="w-full" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cx("flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-card py-3.5 text-[12px]", active(href) && "font-medium ring-1 ring-ink")}
                >
                  <Icon className="size-[22px]" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type P = { className?: string };
function IconMore({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
function IconCoin({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 10a2.5 2 0 0 1 5 0c0 2-5 2-5 4a2.5 2 0 0 0 5 0" strokeLinecap="round" />
    </svg>
  );
}
function IconTag({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9-8-8z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}
function IconMegaphone({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 10v4a1 1 0 0 0 1 1h3l8 4V5L8 9H5a1 1 0 0 0-1 1z" strokeLinejoin="round" />
      <path d="M19.5 9.5a3.5 3.5 0 0 1 0 5M8 15l1 5h2.5l-.8-5" strokeLinecap="round" />
    </svg>
  );
}
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
