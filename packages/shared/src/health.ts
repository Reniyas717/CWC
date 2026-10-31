import { z } from 'zod';

export const ServiceHealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type ServiceHealthStatus = z.infer<typeof ServiceHealthStatusSchema>;

export const HealthCheckResponseSchema = z.object({
  status: ServiceHealthStatusSchema,
  service: z.string(),
  version: z.string(),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
  environment: z.string(),
  dependencies: z
    .record(
      z.string(),
      z.object({
        status: ServiceHealthStatusSchema,
        latencyMs: z.number().optional(),
        message: z.string().optional(),
      })
    )
    .optional(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
