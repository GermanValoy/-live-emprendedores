import { sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/** Perfil público de cada persona. Se crea solo al registrarse (ver drizzle/0001_seguridad_users.sql). */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tiendas y productos (Fase 1, Parte 1). Reglas de seguridad en drizzle/0003_seguridad_tiendas.sql.

export const deliveryKind = pgEnum("delivery_kind", ["pickup", "shipping", "meetup"]);
export const shippingMode = pgEnum("shipping_mode", ["free", "fixed", "arrange"]);

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  note: text("note"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(),
  handleChangedAt: timestamp("handle_changed_at", { withTimezone: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  zone: text("zone").notNull(),
  description: text("description"),
  liveScheduleNote: text("live_schedule_note"),
  avatarPath: text("avatar_path"),
  coverPath: text("cover_path"),
  onboardingStep: integer("onboarding_step").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storePrivateInfo = pgTable("store_private_info", {
  storeId: uuid("store_id").primaryKey().references(() => stores.id, { onDelete: "cascade" }),
  paymentAlias: text("payment_alias"),
  paymentHolder: text("payment_holder"),
  pickupAddress: text("pickup_address"),
  pickupHours: text("pickup_hours"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeDeliveryOptions = pgTable(
  "store_delivery_options",
  {
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    kind: deliveryKind("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    shippingMode: shippingMode("shipping_mode"),
    shippingCostCents: integer("shipping_cost_cents"),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.kind] })],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_store_id_idx").on(t.storeId)],
);

export const productPhotos = pgTable(
  "product_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [unique("product_photos_product_position_unique").on(t.productId, t.position)],
);

export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storeId] }), index("follows_store_id_idx").on(t.storeId)],
);

// Vivos (Fase 1, Parte 2). Reglas en drizzle/0005_seguridad_vivos.sql.

/** Fila única con los tiempos de espera del vivo. Se cambia por SQL. */
export const liveConfig = pgTable("live_config", {
  id: integer("id").primaryKey(),
  sinConexionSegundos: integer("sin_conexion_segundos").notNull().default(300),
  fueraSegundos: integer("fuera_segundos").notNull().default(900),
  senalCadaSegundos: integer("senal_cada_segundos").notNull().default(20),
});

/** Transmisión de Cloudflare de cada puesto. Solo la lee el servidor (service_role). */
export const storeStreams = pgTable("store_streams", {
  storeId: uuid("store_id").primaryKey().references(() => stores.id, { onDelete: "cascade" }),
  cloudflareUid: text("cloudflare_uid").notNull(),
  whipUrl: text("whip_url").notNull(),
  whepUrl: text("whep_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    whepUrl: text("whep_url").notNull(),
    deviceId: uuid("device_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
    endedBy: uuid("ended_by").references(() => users.id, { onDelete: "set null" }),
    lastSignalAt: timestamp("last_signal_at", { withTimezone: true }).notNull().defaultNow(),
    awaySince: timestamp("away_since", { withTimezone: true }),
    muted: boolean("muted").notNull().default(false),
    viewers: integer("viewers").notNull().default(0),
    peakViewers: integer("peak_viewers").notNull().default(0),
  },
  (t) => [
    uniqueIndex("live_sessions_un_abierto_por_puesto").on(t.storeId).where(sql`ended_at IS NULL`),
    index("live_sessions_store_started_idx").on(t.storeId, t.startedAt.desc()),
  ],
);
