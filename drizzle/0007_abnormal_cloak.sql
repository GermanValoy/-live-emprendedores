CREATE TABLE "chat_blocked_words" (
	"word" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"largo_maximo" integer DEFAULT 200 NOT NULL,
	"rafaga_mensajes" integer DEFAULT 5 NOT NULL,
	"rafaga_segundos" integer DEFAULT 10 NOT NULL,
	"repetido_segundos" integer DEFAULT 60 NOT NULL,
	"frenados_para_silenciar" integer DEFAULT 3 NOT NULL,
	"frenados_ventana_segundos" integer DEFAULT 600 NOT NULL,
	"silencio_segundos" integer DEFAULT 600 NOT NULL,
	"mensajes_al_entrar" integer DEFAULT 50 NOT NULL,
	"guardar_dias" integer DEFAULT 30 NOT NULL,
	"salas_para_revisar" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"live_session_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"normalized" text NOT NULL,
	"is_seller" boolean DEFAULT false NOT NULL,
	"hidden_reason" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_silences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"until" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"target_user_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"message_id" uuid,
	"message_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_silences" ADD CONSTRAINT "chat_silences_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_silences" ADD CONSTRAINT "chat_silences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_silences" ADD CONSTRAINT "chat_silences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_silences" ADD CONSTRAINT "chat_silences_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_vivo_creado_idx" ON "chat_messages" USING btree ("live_session_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_usuario_puesto_creado_idx" ON "chat_messages" USING btree ("user_id","store_id","created_at");