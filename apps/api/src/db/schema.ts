import {
  pgTable,
  text,
  varchar,
  integer,
  real,
  timestamp,
  bigserial,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// ==============================================================================
// Enums
// ==============================================================================

export const workerStateEnum = pgEnum('worker_state', [
  'idle',
  'busy',
  'draining',
  'offline',
  'error',
]);

export const deploymentStateEnum = pgEnum('deployment_state', [
  'pending',
  'queued',
  'building',
  'deploying',
  'running',
  'failed',
  'stopped',
  'cancelled',
]);

export const appFrameworkEnum = pgEnum('app_framework', [
  'nodejs',
  'python',
  'static',
  'dockerfile',
  'go',
]);

export const logStreamEnum = pgEnum('log_stream', ['stdout', 'stderr', 'system']);
export const logLevelEnum = pgEnum('log_level', ['info', 'warn', 'error', 'debug']);

// ==============================================================================
// Tables
// ==============================================================================

/**
 * Users table (supports MVP default administrator and future multi-tenancy)
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Worker Nodes table
 */
export const workerNodes = pgTable('worker_nodes', {
  id: varchar('id', { length: 128 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  hostname: varchar('hostname', { length: 255 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }).notNull(),
  port: integer('port').notNull().default(5001),
  state: workerStateEnum('state').notNull().default('idle'),
  cpuCores: integer('cpu_cores').notNull(),
  cpuUsagePercent: integer('cpu_usage_percent').notNull().default(0),
  totalMemoryMb: integer('total_memory_mb').notNull(),
  freeMemoryMb: integer('free_memory_mb').notNull(),
  usedMemoryMb: integer('used_memory_mb').notNull(),
  maxConcurrentWorkloads: integer('max_concurrent_workloads').notNull().default(4),
  activeContainers: integer('active_containers').notNull().default(0),
  version: varchar('version', { length: 32 }).notNull().default('0.1.0'),
  registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Applications table
 */
export const applications = pgTable('applications', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 128 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  framework: appFrameworkEnum('framework').notNull().default('dockerfile'),
  repositoryUrl: text('repository_url').notNull(),
  gitBranch: varchar('git_branch', { length: 128 }).notNull().default('main'),
  rootDirectory: varchar('root_directory', { length: 255 }).notNull().default('/'),
  targetPort: integer('target_port').notNull().default(3000),
  envVars: jsonb('env_vars')
    .$type<Array<{ key: string; value: string; isSecret: boolean }>>()
    .default([])
    .notNull(),
  cpuLimitCores: real('cpu_limit_cores').notNull().default(1.0),
  memoryLimitMb: integer('memory_limit_mb').notNull().default(512),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Deployments table
 */
export const deployments = pgTable('deployments', {
  id: varchar('id', { length: 128 }).primaryKey(),
  applicationId: varchar('application_id', { length: 128 })
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  workerId: varchar('worker_id', { length: 128 }).references(() => workerNodes.id, {
    onDelete: 'set null',
  }),
  // Unique identity for the current worker assignment. Reassigned attempts
  // receive a new value so delayed reports cannot revive old work.
  attemptId: varchar('attempt_id', { length: 128 }),
  version: integer('version').notNull().default(1),
  gitCommitHash: varchar('git_commit_hash', { length: 64 }),
  gitBranch: varchar('git_branch', { length: 128 }).notNull().default('main'),
  state: deploymentStateEnum('state').notNull().default('pending'),
  containerId: varchar('container_id', { length: 128 }),
  assignedPort: integer('assigned_port'),
  publicUrl: text('public_url'),
  workerUrl: text('worker_url'),
  routingStatus: varchar('routing_status', { length: 32 }).notNull().default('pending'),
  routingError: text('routing_error'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Deployment Logs table
 */
export const deploymentLogs = pgTable('deployment_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  deploymentId: varchar('deployment_id', { length: 128 })
    .notNull()
    .references(() => deployments.id, { onDelete: 'cascade' }),
  stream: logStreamEnum('stream').notNull().default('stdout'),
  level: logLevelEnum('level').notNull().default('info'),
  message: text('message').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Deployment Events table
 */
export const deploymentEvents = pgTable('deployment_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  deploymentId: varchar('deployment_id', { length: 128 })
    .notNull()
    .references(() => deployments.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  details: text('details'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

// ==============================================================================
// Relations
// ==============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  deployments: many(deployments),
}));

export const workerNodesRelations = relations(workerNodes, ({ many }) => ({
  deployments: many(deployments),
}));

export const deploymentsRelations = relations(deployments, ({ one, many }) => ({
  application: one(applications, {
    fields: [deployments.applicationId],
    references: [applications.id],
  }),
  worker: one(workerNodes, { fields: [deployments.workerId], references: [workerNodes.id] }),
  logs: many(deploymentLogs),
  events: many(deploymentEvents),
}));

export const deploymentLogsRelations = relations(deploymentLogs, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentLogs.deploymentId],
    references: [deployments.id],
  }),
}));

export const deploymentEventsRelations = relations(deploymentEvents, ({ one }) => ({
  deployment: one(deployments, {
    fields: [deploymentEvents.deploymentId],
    references: [deployments.id],
  }),
}));

// ==============================================================================
// Zod Schemas via drizzle-zod
// ==============================================================================

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertWorkerNodeSchema = createInsertSchema(workerNodes);
export const selectWorkerNodeSchema = createSelectSchema(workerNodes);

export const insertApplicationSchema = createInsertSchema(applications);
export const selectApplicationSchema = createSelectSchema(applications);

export const insertDeploymentSchema = createInsertSchema(deployments);
export const selectDeploymentSchema = createSelectSchema(deployments);

export const insertDeploymentLogSchema = createInsertSchema(deploymentLogs);
export const selectDeploymentLogSchema = createSelectSchema(deploymentLogs);

export const insertDeploymentEventSchema = createInsertSchema(deploymentEvents);
export const selectDeploymentEventSchema = createSelectSchema(deploymentEvents);

// Inferred TypeScript types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type WorkerNodeRow = typeof workerNodes.$inferSelect;
export type NewWorkerNode = typeof workerNodes.$inferInsert;

export type ApplicationRow = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type DeploymentRow = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;

export type DeploymentLogRow = typeof deploymentLogs.$inferSelect;
export type NewDeploymentLog = typeof deploymentLogs.$inferInsert;

export type DeploymentEventRow = typeof deploymentEvents.$inferSelect;
export type NewDeploymentEvent = typeof deploymentEvents.$inferInsert;
