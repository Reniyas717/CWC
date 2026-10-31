ALTER TABLE "deployments" ADD COLUMN "worker_url" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "routing_status" varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "routing_error" text;