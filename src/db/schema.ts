import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  serial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export type LineItem = {
  title: string;
  variantTitle: string | null;
  quantity: number;
  sku: string | null;
  unitPrice: number;
  image: string | null;
  /** Ürünün gerçek fotoğrafları (3D model önizlemesi değil) */
  images?: string[];
  productId?: string | null;
  variantId: string | null;
  inventoryQuantity: number | null;
};

export type Address = {
  name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
};

export type Tracking = { company: string | null; number: string | null; url: string | null };

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(), // gid://shopify/Order/...
    number: integer("number").notNull(),
    name: text("name").notNull(), // #1059
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status").notNull(),
    needsShipping: boolean("needs_shipping").notNull().default(false),
    total: doublePrecision("total").notNull(),
    currency: text("currency").notNull().default("TRY"),
    itemCount: integer("item_count").notNull().default(0),
    customerId: text("customer_id"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    customerOrderCount: integer("customer_order_count"),
    shippingMethod: text("shipping_method"),
    shippingAddress: jsonb("shipping_address").$type<Address | null>(),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
    tracking: jsonb("tracking").$type<Tracking[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    discountCodes: jsonb("discount_codes").$type<string[]>().notNull().default([]),
    note: text("note"),
    test: boolean("test").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_created_idx").on(t.createdAt),
    index("orders_needs_shipping_idx").on(t.needsShipping),
  ],
);

/** Uygulama içi notlar (Shopify'a gitmez) */
export const orderNotes = pgTable("order_notes", {
  orderId: text("order_id").primaryKey(),
  note: text("note").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Aynı bildirimi iki kez göndermemek için (kind + ref benzersiz) */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    title: text("title"),
    body: text("body"),
    url: text("url"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_kind_ref_idx").on(t.kind, t.ref)],
);

/** Ayarlar, token cache vb. */
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

// ---------------------------------------------------------------------------
// DEPO — kendi stok kayıtların (Shopify'dan bağımsız). Siparişler buradan düşer.

export const warehouseItems = pgTable(
  "warehouse_items",
  {
    id: serial("id").primaryKey(),
    /** ürün|beden|renk normalize — aynı satırı iki kez açmamak için */
    key: text("key").notNull(),
    product: text("product").notNull(),
    variant: text("variant"),
    color: text("color"),
    /** Tee, Zip-up, Long Sleeve… */
    category: text("category"),
    /** Koleksiyon / sezon */
    collection: text("collection"),
    sku: text("sku"),
    qty: integer("qty").notNull().default(0),
    /** Bu adet ve altı "azaldı" (boşsa ayarlardaki genel eşik) */
    minQty: integer("min_qty"),
    cost: doublePrecision("cost"),
    location: text("location"),
    image: text("image"),
    shopifyVariantId: text("shopify_variant_id"),
    /** Koleksiyonda var ama stoğu henüz gelmedi (biten sayılmaz, uyarı vermez) */
    upcoming: boolean("upcoming").notNull().default(false),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("warehouse_key_idx").on(t.key), index("warehouse_variant_idx").on(t.shopifyVariantId)],
);

export type MoveReason =
  | "order" // siparişle düştü
  | "cancel" // sipariş iptal → geri eklendi
  | "unmatched" // sipariş geldi ama depoda karşılığı yok
  | "restock" // mal girişi
  | "count" // sayım düzeltmesi
  | "out" // fire / numune
  | "pr" // PR / hediye (kime gittiği notta)
  | "return" // müşteri iadesi
  | "import";

export const stockMoves = pgTable(
  "stock_moves",
  {
    id: serial("id").primaryKey(),
    /** Aynı hareket iki kez işlenmesin (ör. order:<orderId>:<satır>) */
    dedupe: text("dedupe"),
    itemId: integer("item_id"),
    delta: integer("delta").notNull().default(0),
    qtyAfter: integer("qty_after"),
    reason: text("reason").$type<MoveReason>().notNull(),
    ref: text("ref"),
    refName: text("ref_name"),
    note: text("note"),
    meta: jsonb("meta").$type<{ title?: string; variant?: string | null; quantity?: number; variantId?: string | null; image?: string | null }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stock_moves_dedupe_idx").on(t.dedupe), index("stock_moves_item_idx").on(t.itemId), index("stock_moves_created_idx").on(t.createdAt)],
);

export type WarehouseItem = typeof warehouseItems.$inferSelect;
export type StockMove = typeof stockMoves.$inferSelect;

// ---------------------------------------------------------------------------
// Instagram story arşivi — story verisi 24 saat sonra API'den kalkar; cron her çalıştığında son halini yazar.
export const igStories = pgTable(
  "ig_stories",
  {
    id: text("id").primaryKey(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    mediaType: text("media_type"),
    permalink: text("permalink"),
    image: text("image"),
    views: integer("views").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    replies: integer("replies").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    interactions: integer("interactions").notNull().default(0),
    follows: integer("follows").notNull().default(0),
    profileVisits: integer("profile_visits").notNull().default(0),
    tapsForward: integer("taps_forward").notNull().default(0),
    tapsBack: integer("taps_back").notNull().default(0),
    exits: integer("exits").notNull().default(0),
    swipeForward: integer("swipe_forward").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ig_stories_published_idx").on(t.publishedAt)],
);

// Drop takibi — teaser başlangıcı → lansman → sonrası
export const drops = pgTable("drops", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  teaserAt: timestamp("teaser_at", { withTimezone: true }).notNull(),
  launchAt: timestamp("launch_at", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IgStory = typeof igStories.$inferSelect;
export type Drop = typeof drops.$inferSelect;

// ---------------------------------------------------------------------------
// PR / influencer gönderimleri

export const prPeople = pgTable("pr_people", {
  id: serial("id").primaryKey(),
  /** Instagram kullanıcı adı, @ olmadan, küçük harf */
  handle: text("handle").notNull().unique(),
  name: text("name"),
  phone: text("phone"),
  /** Bu kişiye özel indirim kodu (siparişlerde geçerse satış ona yazılır) */
  code: text("code"),
  category: text("category"),
  note: text("note"),
  igId: text("ig_id"),
  followers: integer("followers"),
  mediaCount: integer("media_count"),
  avatar: text("avatar"),
  /** Business discovery çalışmadıysa nedeni (kişisel hesap vb.) */
  scanError: text("scan_error"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrItem = { itemId: number | null; product: string; variant: string | null; qty: number; cost: number | null; image: string | null };

export const prSends = pgTable(
  "pr_sends",
  {
    id: serial("id").primaryKey(),
    personId: integer("person_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    items: jsonb("items").$type<PrItem[]>().notNull().default([]),
    note: text("note"),
    /** waiting → posted | no_post (süre doldu) */
    status: text("status").$type<"waiting" | "posted" | "no_post">().notNull().default("waiting"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pr_sends_person_idx").on(t.personId)],
);

export const prPosts = pgTable(
  "pr_posts",
  {
    /** Instagram medya kimliği ya da elle eklenen için "url:<permalink>" */
    id: text("id").primaryKey(),
    personId: integer("person_id").notNull(),
    sendId: integer("send_id"),
    source: text("source").$type<"discovery" | "tag" | "manual">().notNull(),
    permalink: text("permalink"),
    mediaType: text("media_type"),
    caption: text("caption"),
    image: text("image"),
    likes: integer("likes"),
    comments: integer("comments"),
    views: integer("views"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pr_posts_person_idx").on(t.personId)],
);

export type PrPerson = typeof prPeople.$inferSelect;
export type PrSend = typeof prSends.$inferSelect;
export type PrPost = typeof prPosts.$inferSelect;

// ---------------------------------------------------------------------------
// Notlar — ortak not defteri; her not bir checklist

export type NoteItem = { id: string; text: string; done: boolean; doneAt?: string | null; doneBy?: string | null };

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body"),
    items: jsonb("items").$type<NoteItem[]>().notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    color: text("color"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_updated_idx").on(t.updatedAt)],
);

export type Note = typeof notes.$inferSelect;

// ---------------------------------------------------------------------------
// Gider defteri

export const EXPENSE_CATEGORIES = [
  "Üretim",
  "Kumaş",
  "Baskı / nakış",
  "Etiket / ambalaj",
  "Çekim",
  "Reklam",
  "Kargo",
  "Model / ekip",
  "PR / hediye",
  "Yazılım / abonelik",
  "Diğer",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    category: text("category").$type<ExpenseCategory>().notNull(),
    title: text("title").notNull(),
    amount: doublePrecision("amount").notNull(),
    vendor: text("vendor"),
    /** Hangi drop / koleksiyon için (serbest metin, ör. "Kış 26") */
    drop: text("drop"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_date_idx").on(t.date)],
);
export type Expense = typeof expenses.$inferSelect;
