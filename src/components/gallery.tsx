"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SmartImg } from "./img";

/**
 * Küçük görsele dokununca tam ekran galeri açılır (kaydırarak gezilir).
 * Paketlerken doğru baskıyı/rengi kontrol etmek için.
 */
export function GalleryThumb({
  images,
  title,
  caption,
  size = 64,
  className,
  children,
}: {
  images: string[];
  title: string;
  caption?: string;
  size?: number;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const has = images.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => has && setOpen(true)}
        className={`relative shrink-0 overflow-hidden rounded-xl border border-line bg-cream transition active:scale-[0.97] ${className ?? ""}`}
        style={children ? undefined : { width: size, height: size }}
        aria-label={`${title} fotoğrafları`}
      >
        {children ?? <SmartImg src={images[0]} alt={title} label={title} className="size-full" />}
        {images.length > 1 && !children && (
          <span className="num absolute right-1 bottom-1 rounded-full bg-ink/70 px-1.5 text-[9.5px] font-medium text-paper backdrop-blur">
            {images.length}
          </span>
        )}
      </button>
      {open && <Lightbox images={images} title={title} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({
  images,
  title,
  caption,
  onClose,
}: {
  images: string[];
  title: string;
  caption?: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function go(d: number) {
      const el = track.current;
      if (!el) return;
      el.scrollBy({ left: d * el.clientWidth, behavior: "smooth" });
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="animate-in fixed inset-0 z-[60] flex flex-col bg-paper" role="dialog" aria-modal>
      <div className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{title}</p>
          {caption && <p className="text-[12.5px] text-mute">{caption}</p>}
        </div>
        <button onClick={onClose} className="h-9 rounded-full border border-line bg-card px-4 text-[13px] font-medium">
          Kapat
        </button>
      </div>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setI(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]"
      >
        {images.map((src, k) => (
          <div key={src + k} className="flex w-full shrink-0 snap-center items-center justify-center px-3">
            <SmartImg src={src.replace(/_\d+x(\.\w+)/, "_1200x$1")} alt={title} label={title} eager={k < 2} className="aspect-[4/5] max-h-full w-full rounded-2xl object-contain" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 pt-3 pb-[max(18px,env(safe-area-inset-bottom))]">
        {images.map((_, k) => (
          <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-ink" : "w-1.5 bg-sand"}`} />
        ))}
      </div>
    </div>,
    document.body,
  );
}
