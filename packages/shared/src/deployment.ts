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
