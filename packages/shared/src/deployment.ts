import { z } from 'zod';

export const DeploymentStateSchema = z.enum([
  'pending',
  'queued',
  'building',
  'deploying',
  'running',
  'failed',
  'stopped',
  'cancelled',
]);
export type DeploymentState = z.infer<typeof DeploymentStateSchema>;

export const DeploymentLogEntrySchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  level: z.enum(['info', 'warn', 'error', 'debug']),
  message: z.string(),
  stream: z.enum(['stdout', 'stderr', 'system']).default('stdout'),
});
export type DeploymentLogEntry = z.infer<typeof DeploymentLogEntrySchema>;

export const DeploymentSchema = z.object({
  id: z.string().min(1),
  applicationId: z.string().min(1),
  version: z.number().int().positive(),
  gitCommitHash: z.string().optional(),
  gitBranch: z.string().default('main'),
  state: DeploymentStateSchema,
  workerId: z.string().optional(),
  containerId: z.string().optional(),
  assignedPort: z.number().int().optional(),
  publicUrl: z.string().url().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const DeploymentStatusResponseSchema = z.object({
  deployment: DeploymentSchema,
  logs: z.array(DeploymentLogEntrySchema).optional(),
});
export type DeploymentStatusResponse = z.infer<typeof DeploymentStatusResponseSchema>;

export const DeploymentTaskPayloadSchema = z.object({
  deploymentId: z.string().min(1),
  applicationId: z.string().min(1),
  git: z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().default('main'),
    rootDirectory: z.string().default('/'),
    commitHash: z.string().optional(),
  }),
  dockerfilePath: z.string().default('Dockerfile'),
  buildContext: z.string().optional(),
  targetPort: z.number().int().min(1).max(65535).default(3000),
  healthCheckPath: z.string().optional(),
  replicas: z.number().int().min(1).max(10).default(1),
  resourceLimits: z
    .object({
      cpuLimitCores: z.number().positive().default(1.0),
      memoryLimitMb: z.number().int().positive().default(512),
    })
    .default({ cpuLimitCores: 1.0, memoryLimitMb: 512 }),
  env: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        isSecret: z.boolean().default(false),
      })
    )
    .default([]),
});
export type DeploymentTaskPayload = z.infer<typeof DeploymentTaskPayloadSchema>;

export const DeploymentTaskResponseSchema = z.object({
  success: z.boolean(),
  hasTask: z.boolean(),
  action: z.enum(['deploy', 'cancel', 'stop']).optional(),
  deploymentId: z.string().optional(),
  task: DeploymentTaskPayloadSchema.optional(),
});
export type DeploymentTaskResponse = z.infer<typeof DeploymentTaskResponseSchema>;

export const DeploymentResultPayloadSchema = z.object({
  deploymentId: z.string().min(1),
  workerId: z.string().min(1),
  state: z.enum(['running', 'failed', 'stopped']),
  containerId: z.string().optional(),
  assignedPort: z.number().int().optional(),
  publicUrl: z.string().optional(),
  gitCommitHash: z.string().optional(),
  imageTag: z.string().optional(),
  errorMessage: z.string().nullable().optional(),
});
export type DeploymentResultPayload = z.infer<typeof DeploymentResultPayloadSchema>;

export const DeploymentLogsPayloadSchema = z.object({
  deploymentId: z.string().min(1),
  logs: z.array(DeploymentLogEntrySchema),
});
export type DeploymentLogsPayload = z.infer<typeof DeploymentLogsPayloadSchema>;
