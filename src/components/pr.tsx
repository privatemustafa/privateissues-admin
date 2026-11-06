"use client";

import { useActionState, useState, useTransition } from "react";
import {
  prAddLinkAction,
  prCreateSendAction,
  prDeleteSendAction,
  prStatusAction,
  prUpdatePersonAction,
  type ActionResult,
} from "@/app/(app)/actions";
import { cx } from "./ui";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 text-[15px] outline-none focus:border-ink";

type Option = { id: number; label: string; qty: number };
type Known = { handle: string; name: string | null; phone: string | null; code: string | null };

export function PrSendForm({ options, known, startOpen = false }: { options: Option[]; known: Known[]; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [rows, setRows] = useState<{ itemId: number; qty: number }[]>([]);
  const [pick, setPick] = useState("");
  const [handle, setHandle] = useState("");
  const [more, setMore] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult | undefined, form: FormData) => {
    const r = await prCreateSendAction(prev, form);
    if (r.ok) {
      setRows([]);
      setHandle("");
    }
    return r;
  }, undefined);
  const k = known.find((x) => x.handle === handle.replace(/^@/, "").toLowerCase());

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-paper">
        + Ürün gönderdim
      </button>
    );
  }

  const add = (id: number) => {
    if (!id) return;
    setRows((r) => (r.some((x) => x.itemId === id) ? r.map((x) => (x.itemId === id ? { ...x, qty: x.qty + 1 } : x)) : [...r, { itemId: id, qty: 1 }]));
    setPick("");
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
        <input
          name="handle"
          list="pr-known"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@kullaniciadi ya da profil linki"
          autoCapitalize="none"
          autoCorrect="off"
          className={field}
          required
        />
        <datalist id="pr-known">
          {known.map((x) => (
            <option key={x.handle} value={x.handle}>
              {x.name ?? ""}
            </option>
          ))}
        </datalist>
        <input name="sentAt" type="date" className={field} defaultValue={new Date().toISOString().slice(0, 10)} />
      </div>
      {k && <p className="px-1 text-[12.5px] text-mute">Kayıtlı kişi{k.name ? ` · ${k.name}` : ""}{k.code ? ` · kod ${k.code}` : ""}</p>}

      <div className="rounded-2xl border border-line bg-card p-3">
        <select
          value={pick}
          onChange={(e) => add(Number(e.target.value))}
          className="h-11 w-full rounded-xl bg-paper px-3 text-[14.5px] outline-none"
        >
          <option value="">Depodan ürün ekle…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} ({o.qty})
            </option>
          ))}
        </select>
        {rows.length > 0 && (
          <div className="mt-2 divide-y divide-line">
            {rows.map((r) => {
              const o = options.find((x) => x.id === r.itemId);
              return (
                <div key={r.itemId} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[14px]">{o?.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.map((x) => (x.itemId === r.itemId ? { ...x, qty: Math.max(0, x.qty - 1) } : x)).filter((x) => x.qty > 0))}
                      className="size-8 rounded-full border border-line"
                    >
                      −
                    </button>
                    <span className="num w-6 text-center text-[14px]">{r.qty}</span>
                    <button
                      type="button"
                      onClick={() => setRows((rs) => rs.map((x) => (x.itemId === r.itemId ? { ...x, qty: x.qty + 1 } : x)))}
                      className="size-8 rounded-full border border-line"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {more ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input name="name" placeholder="İsim" className={field} defaultValue={k?.name ?? ""} />
          <input name="phone" placeholder="Telefon (WhatsApp hatırlatma için)" inputMode="tel" className={field} defaultValue={k?.phone ?? ""} />
          <input name="code" placeholder="Kişiye özel indirim kodu (ör. MELIS10)" className={cx(field, "uppercase")} defaultValue={k?.code ?? ""} />
          <select name="category" className={field} defaultValue="">
            <option value="">Tür</option>
            <option>Influencer</option>
            <option>Ünlü</option>
            <option>Stilist</option>
            <option>Fotoğrafçı</option>
            <option>Arkadaş</option>
          </select>
          <input name="note" placeholder="Not" className={cx(field, "sm:col-span-2")} />
        </div>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="px-1 text-[13px] text-mute underline underline-offset-2">
          İsim, telefon, indirim kodu ekle
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-paper disabled:opacity-50">
          {pending ? "Kaydediliyor…" : "Kaydet ve stoktan düş"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-[14px] text-mute">
          Kapat
        </button>
        {state?.message && <span className={cx("text-[13px]", state.ok ? "text-fresh" : "text-late")}>{state.message}</span>}
      </div>
    </form>
  );
}

/** Bir gönderim için hızlı işlemler. */
export function SendActions({ id, status }: { id: number; status: "waiting" | "posted" | "no_post" }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.message ?? null);
    });
  const btn = "h-8 rounded-full border border-line bg-card px-3 text-[12.5px] disabled:opacity-50";

  if (link !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="instagram.com/p/… ya da story linki"
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-card px-3 text-[13px] outline-none focus:border-ink"
        />
        <button disabled={pending || !link} onClick={() => run(async () => { const r = await prAddLinkAction(id, link); if (r.ok) setLink(null); return r; })} className={cx(btn, "bg-ink text-paper")}>
          Ekle
        </button>
        <button onClick={() => setLink(null)} className="h-8 px-2 text-[12.5px] text-mute">
          Vazgeç
        </button>
        {msg && <span className="text-[12px] text-mute">{msg}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button disabled={pending} onClick={() => setLink("")} className={btn}>
        Paylaşım linki ekle
      </button>
      {status !== "posted" && (
        <button disabled={pending} onClick={() => run(() => prStatusAction(id, "posted"))} className={btn}>
          Paylaştı
        </button>
      )}
      {status === "waiting" && (
        <button disabled={pending} onClick={() => run(() => prStatusAction(id, "no_post"))} className={btn}>
          Paylaşmadı
        </button>
      )}
      {status !== "waiting" && (
        <button disabled={pending} onClick={() => run(() => prStatusAction(id, "waiting"))} className={btn}>
          Beklemeye al
        </button>
      )}
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("Gönderim silinsin mi? Ürünler stoğa geri eklenecek.")) run(() => prDeleteSendAction(id, true));
        }}
        className={cx(btn, "text-late")}
      >
        Sil
      </button>
      {msg && <span className="text-[12px] text-mute">{msg}</span>}
    </div>
  );
}

/** Kişinin telefon / kod / isim bilgisini düzenle. */
export function PersonEdit({ id, name, phone, code }: { id: number; name: string | null; phone: string | null; code: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({ name: name ?? "", phone: phone ?? "", code: code ?? "" });
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12.5px] text-mute underline underline-offset-2">
        Düzenle
      </button>
    );
  }
  const input = "h-9 min-w-0 rounded-full border border-line bg-card px-3 text-[13px] outline-none focus:border-ink";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={input} placeholder="İsim" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <input className={input} placeholder="Telefon" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      <input className={cx(input, "uppercase")} placeholder="İndirim kodu" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await prUpdatePersonAction(id, { name: v.name || null, phone: v.phone || null, code: v.code || null });
            setOpen(false);
          })
        }
        className="h-9 rounded-full bg-ink px-4 text-[12.5px] text-paper disabled:opacity-50"
      >
        Kaydet
      </button>
    </div>
  );
}
