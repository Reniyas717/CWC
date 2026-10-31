CREATE TYPE "public"."app_framework" AS ENUM('nodejs', 'python', 'static', 'dockerfile', 'go');--> statement-breakpoint
CREATE TYPE "public"."deployment_state" AS ENUM('pending', 'queued', 'building', 'deploying', 'running', 'failed', 'stopped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error', 'debug');--> statement-breakpoint
CREATE TYPE "public"."log_stream" AS ENUM('stdout', 'stderr', 'system');--> statement-breakpoint
CREATE TYPE "public"."worker_state" AS ENUM('idle', 'busy', 'draining', 'offline', 'error');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"framework" "app_framework" DEFAULT 'dockerfile' NOT NULL,
	"repository_url" text NOT NULL,
	"git_branch" varchar(128) DEFAULT 'main' NOT NULL,
	"root_directory" varchar(255) DEFAULT '/' NOT NULL,
	"target_port" integer DEFAULT 3000 NOT NULL,
	"env_vars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cpu_limit_cores" real DEFAULT 1 NOT NULL,
	"memory_limit_mb" integer DEFAULT 512 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "deployment_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deployment_id" varchar(128) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"details" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deployment_id" varchar(128) NOT NULL,
	"stream" "log_stream" DEFAULT 'stdout' NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"application_id" varchar(128) NOT NULL,
	"worker_id" varchar(128),
	"version" integer DEFAULT 1 NOT NULL,
	"git_commit_hash" varchar(64),
	"git_branch" varchar(128) DEFAULT 'main' NOT NULL,
	"state" "deployment_state" DEFAULT 'pending' NOT NULL,
	"container_id" varchar(128),
	"assigned_port" integer,
	"public_url" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "worker_nodes" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"ip_address" varchar(64) NOT NULL,
	"port" integer DEFAULT 5001 NOT NULL,
	"state" "worker_state" DEFAULT 'idle' NOT NULL,
	"cpu_cores" integer NOT NULL,
	"cpu_usage_percent" integer DEFAULT 0 NOT NULL,
	"total_memory_mb" integer NOT NULL,
	"free_memory_mb" integer NOT NULL,
	"used_memory_mb" integer NOT NULL,
	"max_concurrent_workloads" integer DEFAULT 4 NOT NULL,
	"active_containers" integer DEFAULT 0 NOT NULL,
	"version" varchar(32) DEFAULT '0.1.0' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_logs" ADD CONSTRAINT "deployment_logs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_worker_id_worker_nodes_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_nodes"("id") ON DELETE set null ON UPDATE no action;