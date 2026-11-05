ALTER TABLE "live_sessions" ADD COLUMN "signal_window_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "signal_count" integer DEFAULT 0 NOT NULL;