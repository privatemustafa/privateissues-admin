"use client";

import { useActionState, useState } from "react";
import { addDropAction } from "@/app/(app)/actions";
import { cx } from "./ui";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 text-[15px] outline-none focus:border-ink";

export function DropForm({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState(addDropAction, undefined);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-10 rounded-full border border-line bg-card px-4 text-[14px] font-medium">
        + Drop ekle
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input name="name" placeholder="Drop adı (ör. Kış 26)" className={field} required />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="px-1 text-[12px] text-mute">Teaser başladı</span>
          <input name="teaserAt" type="date" className={field} required />
        </label>
        <label className="space-y-1">
          <span className="px-1 text-[12px] text-mute">Lansman</span>
          <input name="launchAt" type="datetime-local" className={field} required />
        </label>
      </div>
      <input name="note" placeholder="Not (isteğe bağlı): kaç ürün, indirim kodu…" className={field} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-paper disabled:opacity-50">
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-[14px] text-mute">
          Vazgeç
        </button>
        {state?.message && <span className={cx("text-[13px]", state.ok ? "text-fresh" : "text-late")}>{state.message}</span>}
      </div>
    </form>
  );
}
