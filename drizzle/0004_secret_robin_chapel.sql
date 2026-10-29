CREATE TABLE "live_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"sin_conexion_segundos" integer DEFAULT 300 NOT NULL,
	"fuera_segundos" integer DEFAULT 900 NOT NULL,
	"senal_cada_segundos" integer DEFAULT 20 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"whep_url" text NOT NULL,
	"device_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"ended_by" uuid,
	"last_signal_at" timestamp with time zone DEFAULT now() NOT NULL,
	"away_since" timestamp with time zone,
	"muted" boolean DEFAULT false NOT NULL,
	"viewers" integer DEFAULT 0 NOT NULL,
	"peak_viewers" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_streams" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"cloudflare_uid" text NOT NULL,
	"whip_url" text NOT NULL,
	"whep_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_streams" ADD CONSTRAINT "store_streams_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_un_abierto_por_puesto" ON "live_sessions" USING btree ("store_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "live_sessions_store_started_idx" ON "live_sessions" USING btree ("store_id","started_at" DESC NULLS LAST);