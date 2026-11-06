"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 76;

/** Uygulama modunda tarayıcının yenile tuşu olmadığı için: en üstteyken aşağı çek → yenile. */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    function down(e: TouchEvent) {
      if (window.scrollY > 0 || document.body.style.overflow === "hidden") return;
      startY.current = e.touches[0].clientY;
      armed.current = false;
      setDragging(true);
    }
    function move(e: TouchEvent) {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        setPull(0);
        return;
      }
      const eased = Math.min(120, dy * 0.5);
      if (eased >= THRESHOLD && !armed.current) {
        armed.current = true;
        navigator.vibrate?.(10);
      }
      setPull(eased);
    }
    function up() {
      if (startY.current == null) return;
      startY.current = null;
      setDragging(false);
      if (armed.current) start(() => router.refresh());
      setPull(0);
    }
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [router]);

  const visible = pull > 8 || pending;
  const y = pending ? 54 : pull;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${Math.max(0, y - 40)}px)`,
        opacity: visible ? 1 : 0,
        transition: dragging ? "none" : "transform .3s, opacity .3s",
      }}
    >
      <div className="mt-[env(safe-area-inset-top)] flex size-10 items-center justify-center rounded-full border border-line bg-card shadow-md">
        <svg
          viewBox="0 0 24 24"
          className={`size-5 ${pending ? "animate-spin" : ""}`}
          style={pending ? undefined : { transform: `rotate(${(pull / THRESHOLD) * 300}deg)` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M20 12a8 8 0 1 1-2.34-5.66" strokeLinecap="round" />
          <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
