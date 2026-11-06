"use client";

import { useEffect, useState, useTransition } from "react";
import { testPushAction } from "@/app/(app)/actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
        return setState("unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, [publicKey]);

  async function enable() {
    setMsg(null);
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey!),
    });
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!r.ok) return setMsg("Kayıt başarısız");
    setState("on");
    setMsg("Bu cihaz bildirim alacak.");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    setState("off");
  }

  const label: Record<State, string> = {
    loading: "Kontrol ediliyor…",
    unsupported: publicKey
      ? "Bu tarayıcı bildirim desteklemiyor. Uygulamayı ana ekrana ekleyip oradan aç."
      : "VAPID anahtarları eksik (.env).",
    denied: "Bildirim izni reddedilmiş. Tarayıcı/site ayarlarından izin ver.",
    off: "Bu cihazda bildirimler kapalı.",
    on: "Bu cihazda bildirimler açık.",
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-medium">Bildirimler</p>
          <p className="mt-0.5 text-[13px] text-mute">{label[state]}</p>
        </div>
        {(state === "off" || state === "on") && (
          <button
            onClick={() => start(state === "on" ? disable : enable)}
            disabled={pending}
            role="switch"
            aria-checked={state === "on"}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${state === "on" ? "bg-ink" : "bg-sand"}`}
          >
            <span
              className={`absolute top-1 size-6 rounded-full bg-card shadow transition-all ${state === "on" ? "left-7" : "left-1"}`}
            />
          </button>
        )}
      </div>
      {state === "on" && (
        <button
          onClick={() =>
            start(async () => {
              const r = await testPushAction();
              setMsg(r.message ?? null);
            })
          }
          disabled={pending}
          className="mt-4 h-10 rounded-full border border-line px-4 text-[14px] font-medium transition active:scale-[0.98]"
        >
          {pending ? "Gönderiliyor…" : "Test bildirimi gönder"}
        </button>
      )}
      {msg && <p className="mt-2 text-[13px] text-mute">{msg}</p>}
    </div>
  );
}
