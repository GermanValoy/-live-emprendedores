import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, pgEnum, pgTable, primaryKey, real, text, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
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
  /** Plazo de pago propio de la feriante, en minutos. Nulo = el de code_config. */
  paymentMinutes: integer("payment_minutes"),
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
    signalWindowStart: timestamp("signal_window_start", { withTimezone: true }),
    signalCount: integer("signal_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("live_sessions_un_abierto_por_puesto").on(t.storeId).where(sql`ended_at IS NULL`),
    index("live_sessions_store_started_idx").on(t.storeId, t.startedAt.desc()),
  ],
);

// Chat (Fase 1, Parte 3). Reglas en drizzle/0008_seguridad_chat.sql.

/** Fila única con los límites del chat. Se cambia por SQL; solo la lee el servidor. */
export const chatConfig = pgTable("chat_config", {
  id: integer("id").primaryKey(),
  largoMaximo: integer("largo_maximo").notNull().default(200),
  rafagaMensajes: integer("rafaga_mensajes").notNull().default(5),
  rafagaSegundos: integer("rafaga_segundos").notNull().default(10),
  repetidoSegundos: integer("repetido_segundos").notNull().default(60),
  frenadosParaSilenciar: integer("frenados_para_silenciar").notNull().default(3),
  frenadosVentanaSegundos: integer("frenados_ventana_segundos").notNull().default(600),
  silencioSegundos: integer("silencio_segundos").notNull().default(600),
  mensajesAlEntrar: integer("mensajes_al_entrar").notNull().default(50),
  guardarDias: integer("guardar_dias").notNull().default(30),
  salasParaRevisar: integer("salas_para_revisar").notNull().default(3),
});

/** Palabras que el moderador automático oculta (ya normalizadas: minúsculas, sin tildes). */
export const chatBlockedWords = pgTable("chat_blocked_words", {
  word: text("word").primaryKey(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    normalized: text("normalized").notNull(),
    isSeller: boolean("is_seller").notNull().default(false),
    hiddenReason: text("hidden_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_vivo_creado_idx").on(t.liveSessionId, t.createdAt),
    index("chat_messages_usuario_puesto_creado_idx").on(t.userId, t.storeId, t.createdAt),
  ],
);

/** Intentos de escribir de personas silenciadas (para que no puedan insistir sin límite). Solo la función de la base la usa. */
export const chatSilencedAttempts = pgTable(
  "chat_silenced_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_silenced_attempts_usuario_creado_idx").on(t.userId, t.createdAt)],
);

export const chatSilences = pgTable("chat_silences", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  source: text("source").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  until: timestamp("until", { withTimezone: true }),
  liftedAt: timestamp("lifted_at", { withTimezone: true }),
  liftedBy: uuid("lifted_by").references(() => users.id, { onDelete: "set null" }),
});

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
  targetUserId: uuid("target_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorKind: text("actor_kind").notNull(),
  action: text("action").notNull(),
  messageId: uuid("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
  messageBody: text("message_body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Código en vivo (Fase 1, Parte 4). Reglas en drizzle/0018_seguridad_codigos.sql.

/** Fila única con los números del código en vivo y de la voz. Se cambia por SQL; solo la lee el servidor. */
export const codeConfig = pgTable("code_config", {
  id: integer("id").primaryKey(),
  plazoMinutos: integer("plazo_minutos").notNull().default(15),
  cartelGanadoraSegundos: integer("cartel_ganadora_segundos").notNull().default(18),
  listaEsperaMax: integer("lista_espera_max").notNull().default(5),
  aceptarCasi: boolean("aceptar_casi").notNull().default(false),
  vozUmbralMinimo: real("voz_umbral_minimo").notNull().default(0.012),
  vozPrevioMs: integer("voz_previo_ms").notNull().default(600),
  vozSilencioFinMs: integer("voz_silencio_fin_ms").notNull().default(800),
  vozMaximoMs: integer("voz_maximo_ms").notNull().default(12000),
  vozSolapeMs: integer("voz_solape_ms").notNull().default(2000),
  vozMinimoVozMs: integer("voz_minimo_voz_ms").notNull().default(500),
  vozSegundosPorDia: integer("voz_segundos_por_dia").notNull().default(10800),
});

export const liveCodes = pgTable(
  "live_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    /** Normalizada con normalizarCodigo (minúsculas, sin tildes ni signos). */
    word: text("word").notNull(),
    /** Como se muestra, en mayúsculas. */
    label: text("label").notNull(),
    priceCents: integer("price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    sold: integer("sold").notNull().default(0),
    photoPath: text("photo_path"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    byVoice: boolean("by_voice").notNull().default(false),
    status: text("status").notNull().default("activo"),
    lastWinnerName: text("last_winner_name"),
    lastWinnerAt: timestamp("last_winner_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("live_codes_vivo_palabra_unique").on(t.liveSessionId, t.word),
    uniqueIndex("live_codes_un_activo_por_vivo").on(t.liveSessionId).where(sql`status = 'activo'`),
    index("live_codes_store_id_idx").on(t.storeId),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeId: uuid("code_id").notNull().references(() => liveCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    messageId: uuid("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    /** Copia del texto: el chat se borra a los 30 días, la prueba de quién llegó primero queda acá. */
    messageBody: text("message_body").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull(),
  },
  (t) => [
    unique("claims_codigo_usuario_unique").on(t.codeId, t.userId),
    index("claims_codigo_estado_hora_idx").on(t.codeId, t.status, t.claimedAt),
    index("claims_user_id_idx").on(t.userId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id").notNull().unique().references(() => claims.id, { onDelete: "cascade" }),
    codeId: uuid("code_id").notNull().references(() => liveCodes.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    liveSessionId: uuid("live_session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    priceCents: integer("price_cents").notNull(),
    deliveryKind: deliveryKind("delivery_kind"),
    shippingCents: integer("shipping_cents"),
    totalCents: integer("total_cents").notNull(),
    /** Copias del alias y el titular con los que se mostró el pago. */
    paymentAlias: text("payment_alias").notNull(),
    paymentHolder: text("payment_holder").notNull(),
    buyerWhatsapp: text("buyer_whatsapp"),
    status: text("status").notNull().default("por_pagar"),
    cancelReason: text("cancel_reason"),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_store_estado_idx").on(t.storeId, t.status),
    index("orders_compradora_creado_idx").on(t.buyerId, t.createdAt),
    index("orders_estado_plazo_idx").on(t.status, t.deadline),
    index("orders_code_id_idx").on(t.codeId),
  ],
);

export const paymentReports = pgTable(
  "payment_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    proofPath: text("proof_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_reports_order_id_idx").on(t.orderId)],
);

/** Segundos de audio mandados a Whisper por puesto y por día (para controlar el costo). Solo el servidor. */
export const voiceUsage = pgTable(
  "voice_usage",
  {
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    seconds: real("seconds").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.day] })],
);
