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
