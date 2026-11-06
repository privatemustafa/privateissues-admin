"use client";

import { useEffect } from "react";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[11px] font-medium tracking-[0.16em] text-mute uppercase">Bağlantı</p>
      <p className="mt-2 text-[22px] font-medium tracking-tight">Şu an veriye ulaşılamıyor.</p>
      <p className="mt-1 max-w-xs text-[14px] text-mute">
        İnternet ya da veritabanı bağlantısı kopmuş olabilir. Birkaç saniye sonra tekrar dene.
      </p>
      <button
        onClick={() => retry()}
        className="mt-6 h-11 rounded-full bg-ink px-6 text-[14px] font-medium text-paper"
      >
        Tekrar dene
      </button>
      {digest && <p className="mt-6 text-[11px] text-faint">#{digest}</p>}
    </div>
  );
}
