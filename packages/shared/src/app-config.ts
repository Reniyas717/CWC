import { z } from 'zod';

export const AppFrameworkSchema = z.enum(['nodejs', 'python', 'static', 'dockerfile', 'go']);
export type AppFramework = z.infer<typeof AppFrameworkSchema>;

export const GitSourceConfigSchema = z.object({
  repositoryUrl: z.string().url(),
  branch: z.string().min(1).default('main'),
  rootDirectory: z.string().default('/'),
  commitHash: z.string().optional(),
});
export type GitSourceConfig = z.infer<typeof GitSourceConfigSchema>;

export const EnvVarSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  isSecret: z.boolean().default(false),
});
export type EnvVar = z.infer<typeof EnvVarSchema>;

export const ResourceLimitsSchema = z.object({
  cpuLimitCores: z.number().positive().default(1.0),
  memoryLimitMb: z.number().int().positive().default(512),
  diskLimitMb: z.number().int().positive().optional(),
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

export const AppConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  framework: AppFrameworkSchema,
  git: GitSourceConfigSchema,
  port: z.number().int().min(1).max(65535).default(3000),
  env: z.array(EnvVarSchema).default([]),
  replicas: z.number().int().min(1).max(10).default(1),
  resourceLimits: ResourceLimitsSchema.default({
    cpuLimitCores: 1.0,
    memoryLimitMb: 512,
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const CreateAppSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  framework: AppFrameworkSchema,
  git: GitSourceConfigSchema,
  port: z.number().int().min(1).max(65535).default(3000),
  env: z.array(EnvVarSchema).optional().default([]),
  replicas: z.number().int().min(1).max(10).optional().default(1),
  resourceLimits: ResourceLimitsSchema.optional(),
});
export type CreateAppInput = z.infer<typeof CreateAppSchema>;
