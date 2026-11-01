ALTER TABLE "deployments" ADD COLUMN "cancel_dispatched_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancel_acknowledged_at" timestamp with time zone;
