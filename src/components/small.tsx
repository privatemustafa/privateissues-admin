"use client";

import { useActionState, useState, useTransition } from "react";
import { saveNoteAction, type ActionResult } from "@/app/(app)/actions";
import { cx } from "./ui";

export function CopyButton({ text, label = "Kopyala" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        navigator.vibrate?.(20);
        setTimeout(() => setDone(false), 1500);
      }}
      className="h-8 rounded-full border border-line px-3 text-[12.5px] font-medium transition active:scale-[0.97]"
    >
      {done ? "Kopyalandı" : label}
    </button>
  );
}

export function NoteEditor({ orderId, initial }: { orderId: string; initial: string }) {
  const [state, action, pending] = useActionState(saveNoteAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="target" value="internal" />
      <textarea
        name="note"
        defaultValue={initial}
        rows={3}
        placeholder="Sadece sen görürsün — paket notu, beden değişimi, el yazısı kart…"
        className="w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] outline-none focus:border-ink"
      />
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          className="h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-paper disabled:opacity-50"
        >
          {pending ? "…" : "Notu kaydet"}
        </button>
        {state?.message && <span className="text-[13px] text-mute">{state.message}</span>}
      </div>
    </form>
  );
}

export function ActionButton({
  action,
  children,
  variant = "ghost",
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: "solid" | "ghost";
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <div>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(await action());
          })
        }
        className={cx(
          "h-10 rounded-full px-4 text-[14px] font-medium transition active:scale-[0.98] disabled:opacity-50",
          variant === "solid" ? "bg-ink text-paper" : "border border-line bg-card",
        )}
      >
        {pending ? "Çalışıyor…" : children}
      </button>
      {msg?.message && (
        <p className={cx("mt-2 text-[13px]", msg.ok ? "text-mute" : "text-late")}>{msg.message}</p>
      )}
    </div>
  );
}
