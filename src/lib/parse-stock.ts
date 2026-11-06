// Excel / Google Sheets'ten kopyala-yapıştır veya CSV → depo satırları. İstemcide çalışır.

export type ParsedRow = {
  product: string;
  variant: string | null;
  color: string | null;
  category: string | null;
  collection: string | null;
  qty: number;
  sku: string | null;
  location: string | null;
  cost: number | null;
  minQty: number | null;
};

type Field = keyof ParsedRow;

const ALIASES: Record<Field, string[]> = {
  product: ["urun", "ürün", "urunadi", "ürünadı", "product", "model", "ad", "adi", "isim", "title", "name"],
  variant: ["beden", "size", "varyant", "variant", "olcu", "ölçü"],
  color: ["renk", "color", "colour"],
  category: ["kategori", "category", "tur", "tür", "tip", "type"],
  collection: ["koleksiyon", "collection", "sezon", "season", "drop"],
  qty: ["adet", "stok", "miktar", "qty", "quantity", "sayi", "sayı", "stock", "elde", "mevcut"],
  sku: ["sku", "kod", "urunkodu", "barkod", "barcode", "code"],
  location: ["raf", "konum", "location", "yer", "depo", "koli", "kutu"],
  cost: ["maliyet", "cost", "alis", "alış", "alisfiyati", "birimmaliyet"],
  minQty: ["min", "minimum", "kritik", "esik", "eşik", "uyari", "uyarı", "minadet"],
};

const key = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

function detectDelimiter(text: string) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (line.includes("\t")) return "\t";
  const semi = (line.match(/;/g) ?? []).length;
  const comma = (line.match(/,/g) ?? []).length;
  return semi >= comma && semi > 0 ? ";" : ",";
}

function splitLine(line: string, d: string) {
  if (d === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === d && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toNum(s: string | undefined) {
  if (!s) return null;
  const t = s.replace(/[₺\s]|TL/gi, "");
  // 1.250,50 → 1250.50 ; 1250.5 → 1250.5
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const SIZE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|\d{2}(\/\d{2})?|tek ?beden|std|standart|os)$/i;

export function parseStock(text: string): { rows: ParsedRow[]; columns: Partial<Record<Field, number>>; warnings: string[] } {
  const d = detectDelimiter(text);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, " "))
    .filter((l) => l.trim());
  const warnings: string[] = [];
  if (!lines.length) return { rows: [], columns: {}, warnings };

  const head = splitLine(lines[0], d);
  const columns: Partial<Record<Field, number>> = {};
  head.forEach((h, i) => {
    const k = key(h);
    for (const [f, al] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (columns[f] == null && al.some((a) => key(a) === k)) columns[f] = i;
    }
  });

  let body = lines.slice(1);
  if (columns.product == null || columns.qty == null) {
    // Başlık yok → ürün, beden, adet, (renk, raf) varsay
    body = lines;
    const first = splitLine(lines[0], d);
    const qtyIdx = first.findIndex((c, i) => i > 0 && toNum(c) != null && !SIZE.test(c));
    Object.assign(columns, { product: 0, variant: first.length > 2 ? 1 : undefined, qty: qtyIdx > 0 ? qtyIdx : first.length - 1 });
    warnings.push("Başlık satırı bulunamadı; sütunları Ürün · Beden · Adet olarak okudum.");
  }

  const rows: ParsedRow[] = [];
  let lastProduct = "";
  body.forEach((line, n) => {
    const c = splitLine(line, d);
    const get = (f: Field) => (columns[f] != null ? c[columns[f]!] : undefined);
    // Excel'de birleştirilmiş hücre → ürün adı boşsa üstteki geçerli
    const product = (get("product") || lastProduct || "").trim();
    if (!product) return;
    lastProduct = product;
    const qty = toNum(get("qty"));
    if (qty == null) {
      warnings.push(`Satır ${n + (columns.product === 0 && body === lines ? 1 : 2)}: adet okunamadı, atlandı.`);
      return;
    }
    rows.push({
      product,
      variant: get("variant") || null,
      color: get("color") || null,
      category: get("category") || null,
      collection: get("collection") || null,
      qty: Math.round(qty),
      sku: get("sku") || null,
      location: get("location") || null,
      cost: toNum(get("cost")),
      minQty: toNum(get("minQty")),
    });
  });
  return { rows, columns, warnings };
}

export const FIELD_LABEL: Record<Field, string> = {
  product: "Ürün",
  variant: "Beden",
  color: "Renk",
  category: "Kategori",
  collection: "Koleksiyon",
  qty: "Adet",
  sku: "Kod",
  location: "Raf",
  cost: "Maliyet",
  minQty: "Min",
};
