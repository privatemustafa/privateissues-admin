import type { Order } from "@/db/schema";
import type { ShipSummary } from "@/components/ship-sheet";
import { isExpress } from "./format";

export function waNumber(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "90" + d.slice(1);
  else if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d.length >= 11 ? d : null;
}

export function addressText(o: Pick<Order, "shippingAddress" | "customerPhone">) {
  const a = o.shippingAddress;
  if (!a) return "";
  return [a.name, a.address1, a.address2, [a.zip, a.city, a.province].filter(Boolean).join(" "), a.phone ?? o.customerPhone]
    .filter(Boolean)
    .join("\n");
}

/** Kargola paneline gidecek sade (serileştirilebilir) özet. */
export function shipSummary(o: Order): ShipSummary {
  return {
    orderId: o.id,
    orderName: o.name,
    customerFirst: (o.customerName ?? "").split(" ")[0] || "merhaba",
    wa: waNumber(o.shippingAddress?.phone ?? o.customerPhone),
    items: o.lineItems.map((l) => ({ title: l.title, variant: l.variantTitle, qty: l.quantity, image: l.image })),
    address: addressText(o),
    express: isExpress(o.shippingMethod),
  };
}

export function itemImages(l: { images?: string[]; image: string | null }) {
  return l.images?.length ? l.images : l.image ? [l.image] : [];
}
