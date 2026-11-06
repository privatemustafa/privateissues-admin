import type { ImportRow } from "@/lib/warehouse";

/**
 * Private Issues — başlangıç stoğu (Mustafa'nın verdiği veriler).
 *
 * ESKİ KOLEKSİYON: "Private_Issues_Stok_2026-08-19_180601.pdf" (yerel stok raporu, 19 Ağu 2026 18:06).
 *   Depo bu tarihten başlar → rapordan SONRA gelen Shopify siparişleri otomatik düşülür
 *   (Hareketler'de sipariş numarasıyla görünür).
 *   Ad eşleştirmeleri (Shopify başlığı ← rapordaki ad):
 *     KNIGHT ZIP-UP ← knight zipup
 *     PRAY FOR SWAG ZIP-UP ← prayforswag zipup
 *     FULL UNNCESSARY CREATIVE KNOWLEDGE ← fuck tee   (Shopify adresi /products/fuck)
 *     BAD BITCH TEE ← hug tee                        (adres /products/i-need-a-hug-from-a-bad-bitch)
 *     CHAIN TEE ← chain tee · ISSUE BAG ← issue bag · ISSUE JORT ← issue jort
 *     TOXIC TEE, FLOWER TEE, WINE TEE → Shopify'da yok, raporundaki adla.
 *
 * YENİ KOLEKSİYON: WhatsApp mesajı ("total bu çıktı final", 6 Kas 2026).
 *   beyaz → Rich Long Sleeve · siyah → Summer Has Gone Long Sleeve · waffle → Heaven Long Sleeve
 *   Shopify'da henüz yoklar; aynı adla açıldıklarında siparişler otomatik eşleşir.
 */

export const OLD_REPORT_AT = new Date("2026-08-19T18:06:01+03:00");

const IMG = (file: string, v: string) => `https://cdn.shopify.com/s/files/1/0694/7402/5590/files/${file}_800x.jpg?v=${v}`;

type Def = {
  product: string;
  category: string;
  collection: string;
  color?: string;
  image?: string;
  location?: string;
  sizes: Record<string, { qty: number; id?: string }>;
};

const OLD = "İlk koleksiyon";
const NEW = "Yeni koleksiyon";

const DEFS: Def[] = [
  // --- Yeni koleksiyon (mesajdaki adetler) -------------------------------
  {
    product: "Rich Long Sleeve",
    category: "Long Sleeve",
    collection: NEW,
    color: "Beyaz",
    sizes: { S: { qty: 7 }, M: { qty: 8 }, L: { qty: 13 }, XL: { qty: 6 } }, // 34
  },
  {
    product: "Summer Has Gone Long Sleeve",
    category: "Long Sleeve",
    collection: NEW,
    color: "Siyah",
    sizes: { S: { qty: 7 }, M: { qty: 10 }, L: { qty: 12 }, XL: { qty: 6 } }, // 35
  },
  {
    product: "Heaven Long Sleeve",
    category: "Long Sleeve",
    collection: NEW,
    color: "Waffle",
    sizes: { S: { qty: 5 }, M: { qty: 8 }, L: { qty: 7 } }, // 20
  },

  // --- İlk koleksiyon (19 Ağu raporu) -------------------------------------
  {
    product: "KNIGHT ZIP-UP",
    category: "Zip-up",
    collection: OLD,
    image: IMG("32", "1778594388"),
    sizes: {
      S: { qty: 32, id: "gid://shopify/ProductVariant/43366647136374" },
      M: { qty: 25, id: "gid://shopify/ProductVariant/43366647103606" },
      L: { qty: 22, id: "gid://shopify/ProductVariant/43366647070838" },
    },
  },
  {
    product: "PRAY FOR SWAG ZIP-UP",
    category: "Zip-up",
    collection: OLD,
    image: IMG("25", "1778594181"),
    sizes: {
      S: { qty: 32, id: "gid://shopify/ProductVariant/43366646153334" },
      M: { qty: 25, id: "gid://shopify/ProductVariant/43366646120566" },
      L: { qty: 23, id: "gid://shopify/ProductVariant/43366646186102" },
    },
  },
  {
    product: "FULL UNNCESSARY CREATIVE KNOWLEDGE",
    category: "Tee",
    collection: OLD,
    image: IMG("5_163b3d5d-62b9-40db-9913-b3ac2006455e", "1778593546"),
    sizes: {
      S: { qty: 38, id: "gid://shopify/ProductVariant/43361437319286" },
      M: { qty: 29, id: "gid://shopify/ProductVariant/43361437352054" },
      L: { qty: 34, id: "gid://shopify/ProductVariant/43361437253750" },
    },
  },
  {
    product: "BAD BITCH TEE",
    category: "Tee",
    collection: OLD,
    image: IMG("12", "1778593803"),
    sizes: {
      S: { qty: 35, id: "gid://shopify/ProductVariant/43366625673334" },
      M: { qty: 27, id: "gid://shopify/ProductVariant/43366625706102" },
      L: { qty: 33, id: "gid://shopify/ProductVariant/43366625738870" },
    },
  },
  {
    product: "CHAIN TEE",
    category: "Tee",
    collection: OLD,
    image: IMG("16", "1778593974"),
    sizes: {
      S: { qty: 36, id: "gid://shopify/ProductVariant/43366630588534" },
      M: { qty: 30, id: "gid://shopify/ProductVariant/43366630555766" },
      L: { qty: 36, id: "gid://shopify/ProductVariant/43366630621302" },
    },
  },
  { product: "TOXIC TEE", category: "Tee", collection: OLD, sizes: { S: { qty: 17 }, M: { qty: 17 }, L: { qty: 17 } } },
  { product: "FLOWER TEE", category: "Tee", collection: OLD, sizes: { S: { qty: 16 }, M: { qty: 16 }, L: { qty: 16 } } },
  { product: "WINE TEE", category: "Tee", collection: OLD, sizes: { S: { qty: 16 }, M: { qty: 16 }, L: { qty: 15 } } },
  {
    product: "ISSUE BAG",
    category: "Çanta",
    collection: OLD,
    image: IMG("1_24950820-8d8e-49b7-a313-9941fab39e03", "1779382194"),
    sizes: { "": { qty: 12, id: "gid://shopify/ProductVariant/43436572606582" } },
  },
  {
    product: "ISSUE JORT",
    category: "Jort",
    collection: OLD,
    image: IMG("33", "1778594629"),
    sizes: {
      S: { qty: 17, id: "gid://shopify/ProductVariant/43366660046966" },
      M: { qty: 13, id: "gid://shopify/ProductVariant/43366660014198" },
      L: { qty: 14, id: "gid://shopify/ProductVariant/43366660079734" },
    },
  },
];

export const INITIAL_STOCK: ImportRow[] = DEFS.flatMap((d) =>
  Object.entries(d.sizes).map(([size, s]) => ({
    product: d.product,
    variant: size || null,
    color: d.color ?? null,
    category: d.category,
    collection: d.collection,
    qty: s.qty,
    image: d.image ?? null,
    location: d.location ?? null,
    shopifyVariantId: s.id ?? null,
  })),
);

/** Henüz stoğu girilmemiş yeni koleksiyon ürünleri (bilgi amaçlı) */
export const UPCOMING = [
  "Issue Sweatpants",
  "Leopard Long Sleeve",
  "Violation Issue Long Sleeve",
  "Camo Hoodie",
  "Galaxy Zipup",
  "Answer my issues hoodie",
];
