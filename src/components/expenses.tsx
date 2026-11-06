"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { EXPENSE_CATEGORIES, type Expense } from "@/db/schema";
import { expenseAddAction, expenseDeleteAction, expenseUpdateAction } from "@/app/(app)/actions";
import { cx } from "./ui";

const field = "h-12 w-full rounded-2xl border border-line bg-card px-4 text-[15px] outline-none focus:border-ink";

export function ExpenseForm({ drops }: { drops: string[] }) {
  const [state, action, pending] = useActionState(expenseAddAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const [cat, setCat] = useState<string>("Üretim");
  useEffect(() => {
    if (state?.ok) {
      const f = ref.current;
      if (f) {
        (f.elements.namedItem("title") as HTMLInputElement).value = "";
        (f.elements.namedItem("amount") as HTMLInputElement).value = "";
        (f.elements.namedItem("note") as HTMLInputElement).value = "";
        (f.elements.namedItem("title") as HTMLInputElement).focus();
      }
    }
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
        <input name="title" placeholder="Ne için? (ör. 120 adet long sleeve dikim)" className={field} autoFocus required />
        <input name="amount" inputMode="decimal" placeholder="Tutar ₺" className={cx(field, "num")} required />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cx("h-9 shrink-0 rounded-full px-3.5 text-[13px]", cat === c ? "bg-ink text-paper" : "border border-line bg-card text-ink-2")}
          >
            {c}
          </button>
        ))}
      </div>
      <input type="hidden" name="category" value={cat} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input name="date" type="date" className={field} defaultValue={new Date().toISOString().slice(0, 10)} />
        <input name="vendor" placeholder="Kime ödendi" className={field} />
        <input name="drop" list="exp-drops" placeholder="Drop / koleksiyon" className={field} />
        <datalist id="exp-drops">
          {drops.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <input name="note" placeholder="Not" className={field} />
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="h-11 rounded-full bg-ink px-5 text-[14px] font-medium text-paper disabled:opacity-50">
          {pending ? "Kaydediliyor…" : "Ekle"}
        </button>
        {state?.message && <span className={cx("text-[13px]", state.ok ? "text-fresh" : "text-late")}>{state.message}</span>}
      </div>
    </form>
  );
}

export function ExpenseRow({ e }: { e: Expense }) {
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ title: e.title, amount: String(e.amount), vendor: e.vendor ?? "", drop: e.drop ?? "" });
  const input = "h-9 min-w-0 rounded-full border border-line bg-card px-3 text-[13px] outline-none focus:border-ink";
  if (edit) {
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <input className={cx(input, "flex-1")} value={v.title} onChange={(ev) => setV({ ...v, title: ev.target.value })} />
        <input className={cx(input, "num w-28")} inputMode="decimal" value={v.amount} onChange={(ev) => setV({ ...v, amount: ev.target.value })} />
        <input className={cx(input, "w-32")} placeholder="Kime" value={v.vendor} onChange={(ev) => setV({ ...v, vendor: ev.target.value })} />
        <input className={cx(input, "w-28")} placeholder="Drop" value={v.drop} onChange={(ev) => setV({ ...v, drop: ev.target.value })} />
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await expenseUpdateAction(e.id, { title: v.title, amount: Number(v.amount.replace(",", ".")) || e.amount, vendor: v.vendor || null, drop: v.drop || null });
              setEdit(false);
            })
          }
          className="h-9 rounded-full bg-ink px-3 text-[12.5px] text-paper"
        >
          Kaydet
        </button>
        <button onClick={() => setEdit(false)} className="h-9 px-2 text-[12.5px] text-mute">
          Vazgeç
        </button>
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px]">{e.title}</p>
        <p className="text-[12px] text-mute">
          {new Date(e.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · {e.category}
          {e.vendor ? ` · ${e.vendor}` : ""}
          {e.drop ? ` · ${e.drop}` : ""}
          {e.note ? ` · ${e.note}` : ""}
        </p>
      </div>
      <p className="num text-[15px] font-medium">₺{e.amount.toLocaleString("tr-TR")}</p>
      <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button onClick={() => setEdit(true)} className="h-8 rounded-full border border-line px-2.5 text-[12px]">
          Düzenle
        </button>
        <button
          disabled={pending}
          onClick={() => confirm("Silinsin mi?") && start(async () => void (await expenseDeleteAction(e.id)))}
          className="h-8 rounded-full border border-line px-2.5 text-[12px] text-late"
        >
          Sil
        </button>
      </div>
    </div>
  );
}
