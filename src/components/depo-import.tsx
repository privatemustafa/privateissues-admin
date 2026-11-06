"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_LABEL, parseStock, type ParsedRow } from "@/lib/parse-stock";
import { depoImportAction } from "@/app/(app)/actions";
import { Card, Eyebrow, cx } from "./ui";

const SAMPLE = `Ürün\tRenk\tBeden\tAdet\tRaf
KNIGHT ZIP-UP\tSiyah\tS\t12\tA1
KNIGHT ZIP-UP\tSiyah\tM\t8\tA1
CHAIN TEE\t\tL\t20\tB2`;

export function DepoImport({ hasItems }: { hasItems: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();

  const parsed = useMemo(() => (text.trim() ? parseStock(text) : null), [text]);
  const cols = (Object.keys(FIELD_LABEL) as (keyof ParsedRow)[]).filter(
    (f) => f === "product" || f === "qty" || parsed?.rows.some((r) => r[f] != null && r[f] !== ""),
  );
  const total = parsed?.rows.reduce((s, r) => s + r.qty, 0) ?? 0;

  async function onFile(f: File) {
    const t = await f.text();
    setText(t);
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Eyebrow>1 · Listeyi yapıştır</Eyebrow>
        <p className="mt-1 text-[13.5px] text-mute">
          Excel ya da Google Sheets&apos;te hücreleri seç, kopyala, buraya yapıştır. Başlıklar Türkçe ya da İngilizce olabilir:{" "}
          <b className="font-medium text-ink-2">Ürün, Beden, Adet</b> zorunlu; Renk, Raf, Kod, Maliyet, Min isteğe bağlı.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder={SAMPLE}
          className="num mt-3 w-full resize-y rounded-2xl border border-line bg-paper px-4 py-3 font-mono text-[13px] leading-relaxed outline-none focus:border-ink"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
          <label className="cursor-pointer rounded-full border border-line bg-card px-3.5 py-1.5 font-medium">
            CSV dosyası seç
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <button onClick={() => setText(SAMPLE)} className="text-mute underline">
            Örnek doldur
          </button>
          {text && (
            <button onClick={() => setText("")} className="text-mute underline">
              Temizle
            </button>
          )}
        </div>
      </Card>

      {parsed && (
        <Card className="overflow-hidden">
          <div className="flex items-end justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <Eyebrow>2 · Kontrol et</Eyebrow>
              <p className="mt-1 text-[15px]">
                <b className="num font-medium">{parsed.rows.length}</b> satır · <b className="num font-medium">{total}</b> adet
              </p>
            </div>
          </div>
          {parsed.warnings.length > 0 && (
            <ul className="mx-5 mb-3 space-y-0.5 rounded-xl bg-due/10 p-3 text-[12.5px]">
              {parsed.warnings.slice(0, 5).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {parsed.warnings.length > 5 && <li>+{parsed.warnings.length - 5} uyarı daha</li>}
            </ul>
          )}
          <div className="max-h-[340px] overflow-auto border-t border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-paper text-[11px] tracking-wider text-mute uppercase">
                <tr>
                  {cols.map((c) => (
                    <th key={c} className={cx("px-3 py-2 font-medium", (c === "qty" || c === "cost" || c === "minQty") && "text-right")}>
                      {FIELD_LABEL[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {parsed.rows.slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c} className={cx("px-3 py-1.5", (c === "qty" || c === "cost" || c === "minQty") && "num text-right")}>
                        {r[c] ?? <span className="text-faint">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {parsed && parsed.rows.length > 0 && (
        <Card className="p-5">
          <Eyebrow>3 · Aktar</Eyebrow>
          {hasItems && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <ModeCard
                on={mode === "merge"}
                onClick={() => setMode("merge")}
                title="Güncelle"
                sub="Listedekilerin adedini bu değere ayarlar, yenileri ekler. Diğerlerine dokunmaz."
              />
              <ModeCard
                on={mode === "replace"}
                onClick={() => setMode("replace")}
                title="Sıfırdan kur"
                sub="Depoyu ve hareket geçmişini silip bu listeyle baştan başlar."
                danger
              />
            </div>
          )}
          <button
            disabled={pending}
            onClick={() =>
              run(async () => {
                if (mode === "replace" && !confirm("Mevcut depo ve geçmiş silinecek. Emin misin?")) return;
                const r = await depoImportAction(parsed.rows, mode);
                setMsg({ ok: r.ok, text: r.message ?? "" });
                if (r.ok) setTimeout(() => router.push("/depo"), 900);
              })
            }
            className="mt-4 h-12 w-full rounded-2xl bg-ink text-[15px] font-medium text-paper disabled:opacity-50"
          >
            {pending ? "Aktarılıyor…" : `${parsed.rows.length} satırı depoya aktar`}
          </button>
          {msg && <p className={cx("mt-2 text-center text-[13px]", msg.ok ? "text-mute" : "text-late")}>{msg.text}</p>}
          <p className="mt-3 text-[12px] text-faint">
            Aktarımdan sonra gelen siparişler depodan düşer; önceki siparişler düşülmez.
          </p>
        </Card>
      )}
    </div>
  );
}

function ModeCard({ on, onClick, title, sub, danger }: { on: boolean; onClick: () => void; title: string; sub: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-2xl border p-3.5 text-left transition",
        on ? (danger ? "border-late bg-late/5" : "border-ink bg-paper") : "border-line",
      )}
    >
      <p className={cx("text-[14.5px] font-medium", danger && on && "text-late")}>{title}</p>
      <p className="mt-0.5 text-[12.5px] text-mute">{sub}</p>
    </button>
  );
}
