"use client";

import { useState } from "react";

/** Yavaşça beliren görsel; yüklenemezse ürün adının baş harfleriyle şık bir kutu gösterir. */
export function SmartImg({
  src,
  alt,
  className,
  label,
  eager,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Görsel yoksa gösterilecek baş harfler için */
  label?: string;
  eager?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">(src ? "loading" : "error");

  if (!src || state === "error") {
    const initials = (label || alt || "PI")
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <div
        aria-label={alt}
        className={`flex items-center justify-center bg-cream text-[11px] font-medium tracking-wider text-mute ${className ?? ""}`}
      >
        {initials}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setState("ok")}
      onError={() => setState("error")}
      className={`object-cover transition-opacity duration-500 ${state === "ok" ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
    />
  );
}
