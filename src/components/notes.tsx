"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { Note, NoteItem } from "@/db/schema";
import {
  noteAddItemAction,
  noteCreateAction,
  noteDeleteAction,
  noteEditItemAction,
  noteRemoveItemAction,
  noteToggleAction,
  noteUpdateAction,
} from "@/app/(app)/actions";
import { cx } from "./ui";

const NAME_KEY = "pi_note_name";
const field = "w-full rounded-2xl border border-line bg-card px-4 text-[15px] outline-none focus:border-ink";

const listeners = new Set<() => void>();
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
function useName() {
  const name = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    readName,
    () => "",
  );
  const save = (v: string) => {
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {
      /* yok */
    }
    listeners.forEach((l) => l());
  };
  return [name, save] as const;
}

/** Kim işaretledi bilgisi için küçük isim alanı (cihazda saklanır). */
export function WhoAmI() {
  const [name, save] = useName();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  if (!edit && name) {
    return (
      <button onClick={() => (setV(name), setEdit(true))} className="text-[12.5px] text-mute">
        Sen: <b className="font-medium text-ink">{name}</b> · değiştir
      </button>
    );
  }
  if (!edit) {
    return (
      <button onClick={() => setEdit(true)} className="h-9 rounded-full border border-line bg-card px-3 text-[12.5px]">
        Adını yaz → işaretlediklerinde adın görünsün
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(v.trim());
        setEdit(false);
      }}
      className="flex items-center gap-2"
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Adın" className="h-9 w-36 rounded-full border border-line bg-card px-3 text-[13px] outline-none focus:border-ink" />
      <button className="h-9 rounded-full bg-ink px-3 text-[12.5px] text-paper">Tamam</button>
    </form>
  );
}

export function NoteForm() {
  const [open, setOpen] = useState(false);
  const [name] = useName();
  const [state, action, pending] = useActionState(noteCreateAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-paper">
        + Yeni not
      </button>
    );
  }
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="by" value={name} />
      <input name="title" placeholder="Başlık (ör. Kış drop hazırlığı)" className={cx(field, "h-12")} autoFocus />
      <textarea
        name="items"
        rows={5}
        placeholder={"Maddeler — her satır bir madde:\nÇekim lokasyonu bul\nEtiketleri bastır\nKargo poşeti sipariş et"}
        className={cx(field, "py-3 leading-relaxed")}
      />
      <textarea name="body" rows={2} placeholder="Açıklama (isteğe bağlı)" className={cx(field, "py-3")} />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-paper disabled:opacity-50">
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full px-4 text-[14px] text-mute">
          Kapat
        </button>
        {state?.message && <span className={cx("text-[13px]", state.ok ? "text-fresh" : "text-late")}>{state.message}</span>}
      </div>
    </form>
  );
}

export function NoteCard({ note }: { note: Note }) {
  const [name] = useName();
  const [, start] = useTransition();
  const [items, setItems] = useOptimistic(note.items);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [menu, setMenu] = useState(false);
  const done = items.filter((i) => i.done).length;
  const all = items.length > 0 && done === items.length;

  const toggle = (it: NoteItem) =>
    start(async () => {
      setItems(items.map((i) => (i.id === it.id ? { ...i, done: !i.done, doneBy: !i.done ? name || null : null } : i)));
      await noteToggleAction(note.id, it.id, !it.done, name || null);
    });

  return (
    <div className={cx("rounded-3xl border border-line bg-card p-4 md:p-5", all && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cx("text-[16px] font-medium", all && "line-through decoration-mute")}>
            {note.pinned && <span className="mr-1.5 text-due">★</span>}
            {note.title}
          </p>
          {note.body && <p className="mt-1 text-[13.5px] whitespace-pre-wrap text-ink-2">{note.body}</p>}
        </div>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="size-9 rounded-full text-[18px] leading-9 text-mute hover:bg-paper" aria-label="Menü">
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-2xl border border-line bg-card text-[13.5px] shadow-lg">
              {[
                { l: note.pinned ? "Sabitlemeyi kaldır" : "Sabitle", f: () => noteUpdateAction(note.id, { pinned: !note.pinned }) },
                { l: note.archived ? "Geri getir" : "Arşivle", f: () => noteUpdateAction(note.id, { archived: !note.archived }) },
                { l: "Sil", f: () => (confirm("Not silinsin mi?") ? noteDeleteAction(note.id) : Promise.resolve({ ok: false })), danger: true },
              ].map((m) => (
                <button
                  key={m.l}
                  onClick={() => (setMenu(false), start(async () => void (await m.f())))}
                  className={cx("block w-full px-4 py-2.5 text-left hover:bg-paper", m.danger && "text-late")}
                >
                  {m.l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-fresh transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <p className="num mt-1 text-[11.5px] text-mute">
            {done}/{items.length}
          </p>
        </div>
      )}

      <ul className="mt-2 divide-y divide-line">
        {items.map((it) => (
          <li key={it.id} className="group flex items-start gap-3 py-2">
            <button
              onClick={() => toggle(it)}
              aria-label={it.done ? "İşareti kaldır" : "Tamamlandı"}
              className={cx(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition",
                it.done ? "border-fresh bg-fresh text-paper" : "border-line bg-card hover:border-ink",
              )}
            >
              {it.done && (
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            {editing === it.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = editText;
                  setEditing(null);
                  start(async () => void (await noteEditItemAction(note.id, it.id, t)));
                }}
                className="flex min-w-0 flex-1 gap-2"
              >
                <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} className="h-8 min-w-0 flex-1 rounded-full border border-line bg-paper px-3 text-[14px] outline-none" />
                <button className="h-8 rounded-full bg-ink px-3 text-[12px] text-paper">Tamam</button>
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => (setEditing(it.id), setEditText(it.text))}
                  className={cx("block w-full text-left text-[14.5px] leading-snug", it.done && "text-mute line-through")}
                >
                  {it.text}
                </button>
                {it.done && it.doneBy && (
                  <p className="text-[11.5px] text-faint">
                    {it.doneBy}
                    {it.doneAt ? ` · ${new Date(it.doneAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}` : ""}
                  </p>
                )}
              </div>
            )}
            <button
              onClick={() => start(async () => void (await noteRemoveItemAction(note.id, it.id)))}
              className="text-[16px] text-faint opacity-0 transition group-hover:opacity-100 hover:text-late"
              aria-label="Maddeyi sil"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = adding.trim();
          if (!t) return;
          setAdding("");
          start(async () => void (await noteAddItemAction(note.id, t)));
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="+ madde ekle"
          className="h-9 min-w-0 flex-1 rounded-full bg-paper px-3 text-[13.5px] outline-none placeholder:text-faint focus:ring-1 focus:ring-line"
        />
        {adding && <button className="h-9 rounded-full bg-ink px-3 text-[12.5px] text-paper">Ekle</button>}
      </form>
    </div>
  );
}
