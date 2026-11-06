import { connection } from "next/server";
import { db, schema } from "@/db";

export async function GET() {
  await connection();
  const items = await db().select().from(schema.warehouseItems).orderBy(schema.warehouseItems.product);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Ürün", "Renk", "Beden", "Adet", "Raf", "Kod", "Maliyet", "Min"];
  const rows = items.map((i) => [i.product, i.color, i.variant, i.qty, i.location, i.sku, i.cost, i.minQty].map(esc).join(";"));
  // Excel Türkçe için ; ayırıcı + BOM
  const csv = "﻿" + [head.join(";"), ...rows].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="depo-${date}.csv"`,
    },
  });
}
