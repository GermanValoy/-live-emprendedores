CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"buyer_name" text NOT NULL,
	"message_id" uuid,
	"message_body" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "claims_codigo_usuario_unique" UNIQUE("code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "code_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"plazo_minutos" integer DEFAULT 15 NOT NULL,
	"cartel_ganadora_segundos" integer DEFAULT 18 NOT NULL,
	"lista_espera_max" integer DEFAULT 5 NOT NULL,
	"aceptar_casi" boolean DEFAULT false NOT NULL,
	"voz_umbral_minimo" real DEFAULT 0.012 NOT NULL,
	"voz_previo_ms" integer DEFAULT 600 NOT NULL,
	"voz_silencio_fin_ms" integer DEFAULT 800 NOT NULL,
	"voz_maximo_ms" integer DEFAULT 12000 NOT NULL,
	"voz_solape_ms" integer DEFAULT 2000 NOT NULL,
	"voz_minimo_voz_ms" integer DEFAULT 500 NOT NULL,
	"voz_segundos_por_dia" integer DEFAULT 10800 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"word" text NOT NULL,
	"label" text NOT NULL,
	"price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"photo_path" text,
	"product_id" uuid,
	"by_voice" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"last_winner_name" text,
	"last_winner_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "live_codes_vivo_palabra_unique" UNIQUE("live_session_id","word")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"code_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"live_session_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"buyer_name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"delivery_kind" "delivery_kind",
	"shipping_cents" integer,
	"total_cents" integer NOT NULL,
	"payment_alias" text NOT NULL,
	"payment_holder" text NOT NULL,
	"buyer_whatsapp" text,
	"status" text DEFAULT 'por_pagar' NOT NULL,
	"cancel_reason" text,
	"deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_claim_id_unique" UNIQUE("claim_id")
);
--> statement-breakpoint
CREATE TABLE "payment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"proof_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_usage" (
	"store_id" uuid NOT NULL,
	"day" date NOT NULL,
	"seconds" real DEFAULT 0 NOT NULL,
	CONSTRAINT "voice_usage_store_id_day_pk" PRIMARY KEY("store_id","day")
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "payment_minutes" integer;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_code_id_live_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."live_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_codes" ADD CONSTRAINT "live_codes_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_codes" ADD CONSTRAINT "live_codes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_codes" ADD CONSTRAINT "live_codes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_code_id_live_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."live_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reports" ADD CONSTRAINT "payment_reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_usage" ADD CONSTRAINT "voice_usage_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_codigo_estado_hora_idx" ON "claims" USING btree ("code_id","status","claimed_at");--> statement-breakpoint
CREATE INDEX "claims_user_id_idx" ON "claims" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_codes_un_activo_por_vivo" ON "live_codes" USING btree ("live_session_id") WHERE status = 'activo';--> statement-breakpoint
CREATE INDEX "live_codes_store_id_idx" ON "live_codes" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "orders_store_estado_idx" ON "orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "orders_compradora_creado_idx" ON "orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_estado_plazo_idx" ON "orders" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "orders_code_id_idx" ON "orders" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "payment_reports_order_id_idx" ON "payment_reports" USING btree ("order_id");