"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/app/(app)/actions";
import type { Settings } from "@/lib/settings";

function Toggle({ name, label, sub, defaultChecked }: { name: string; label: string; sub: string; defaultChecked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-[15px]">{label}</span>
        <span className="block text-[13px] text-mute">{sub}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-sand transition peer-checked:bg-ink after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-card after:shadow after:transition-all peer-checked:after:left-6" />
    </label>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="divide-y divide-line">
      <Toggle
        name="morningDigest"
        label="Sabah özeti · 09:00"
        sub="Dünkü satış + bekleyen paketler"
        defaultChecked={settings.morningDigest}
      />
      <Toggle
        name="eveningReminder"
        label="Kargo kapanmadan · 16:00"
        sub="Bekleyen paket varsa hatırlatır"
        defaultChecked={settings.eveningReminder}
      />
      <Toggle
        name="quietNights"
        label="Gece sessiz"
        sub="00:00–08:00 arası titreşim/ses yok, hatırlatma yok"
        defaultChecked={settings.quietNights}
      />
      <label className="flex items-center justify-between gap-4 py-3">
        <span>
          <span className="block text-[15px]">Gecikme hatırlatmaları</span>
          <span className="block text-[13px] text-mute">Saat cinsinden; hızlı kargoda yarı süre</span>
        </span>
        <input
          name="overdueHours"
          defaultValue={settings.overdueHours.join(", ")}
          className="num h-10 w-32 rounded-xl border border-line bg-paper px-3 text-right text-[15px] outline-none focus:border-ink"
        />
      </label>
      <label className="flex items-center justify-between gap-4 py-3">
        <span>
          <span className="block text-[15px]">Stok uyarısı</span>
          <span className="block text-[13px] text-mute">Bir beden bu adede düşünce haber ver</span>
        </span>
        <input
          name="lowStock"
          type="number"
          min={0}
          defaultValue={settings.lowStock}
          className="num h-10 w-20 rounded-xl border border-line bg-paper px-3 text-right text-[15px] outline-none focus:border-ink"
        />
      </label>
      <div className="flex items-center gap-3 pt-4">
        <button disabled={pending} className="h-10 rounded-full bg-ink px-5 text-[14px] font-medium text-paper disabled:opacity-50">
          {pending ? "…" : "Kaydet"}
        </button>
        {state?.message && <span className="text-[13px] text-mute">{state.message}</span>}
      </div>
    </form>
  );
}
