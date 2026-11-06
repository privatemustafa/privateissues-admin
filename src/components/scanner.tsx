"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export function scannerSupported() {
  return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

/** Kargo etiketindeki barkodu kamerayla okur (Android Chrome'da yerleşik BarcodeDetector). */
export function BarcodeScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;

    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const detector = new Ctor({
          formats: ["code_128", "code_39", "code_93", "ean_13", "ean_8", "itf", "qr_code", "data_matrix", "pdf417"],
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(async () => {
          if (done || !video.current || video.current.readyState < 2) return;
          try {
            const codes = await detector.detect(video.current);
            const code = codes.find((c) => c.rawValue && c.rawValue.length >= 6)?.rawValue;
            if (code) {
              done = true;
              navigator.vibrate?.([30, 20, 30]);
              onResult(code.trim());
            }
          } catch {}
        }, 250);
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Kamera izni verilmedi." : "Kamera açılamadı.");
      }
    })();

    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-36 w-[78%] max-w-md rounded-3xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <div className="relative mt-auto flex flex-col items-center gap-3 px-6 pb-[max(28px,env(safe-area-inset-bottom))]">
        <p className="text-[14px] text-white/85">{error ?? "Kargo etiketindeki barkodu çerçeveye getir"}</p>
        <button onClick={onClose} className="h-11 rounded-full bg-white px-6 text-[14px] font-medium text-black">
          Vazgeç
        </button>
      </div>
    </div>,
    document.body,
  );
}
