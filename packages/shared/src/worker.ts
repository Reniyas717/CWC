import { z } from 'zod';

export const WorkerStateSchema = z.enum(['idle', 'busy', 'draining', 'offline', 'error']);
export type WorkerState = z.infer<typeof WorkerStateSchema>;

export const WorkerResourcesSchema = z.object({
  cpuCount: z.number().int().positive(),
  cpuUsagePercent: z.number().min(0).max(100),
  totalMemoryMb: z.number().int().positive(),
  freeMemoryMb: z.number().int().nonnegative(),
  usedMemoryMb: z.number().int().nonnegative(),
  totalDiskMb: z.number().int().positive().optional(),
  freeDiskMb: z.number().int().nonnegative().optional(),
  activeContainers: z.number().int().nonnegative(),
});
export type WorkerResources = z.infer<typeof WorkerResourcesSchema>;

export const WorkerLimitsSchema = z.object({
  maxConcurrentWorkloads: z.number().int().positive().default(4),
  maxMemoryMb: z.number().int().positive().default(4096),
  maxCpuCores: z.number().positive().default(2),
});
export type WorkerLimits = z.infer<typeof WorkerLimitsSchema>;

/**
 * Tailscale assigns IPv4 addresses from the CGNAT 100.64.0.0/10 range.
 * Keep this contract narrow so a transport peer address or public interface
 * cannot accidentally become a gateway upstream.
 */
export const TailscaleIpv4Schema = z
  .string()
  .ip({ version: 'v4' })
  .refine((address) => {
    const octets = address.split('.').map(Number);
    return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  }, 'Address must be a Tailscale IPv4 address in 100.64.0.0/10');
export type TailscaleIpv4 = z.infer<typeof TailscaleIpv4Schema>;

export const WorkerNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string(),
  // Heartbeat enrollment records the observed peer, including local or proxied workers.
  ipAddress: z.string().ip(),
  port: z.number().int(),
  state: WorkerStateSchema,
  resources: WorkerResourcesSchema,
  limits: WorkerLimitsSchema,
  version: z.string().default('0.1.0'),
  registeredAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime(),
});
export type WorkerNode = z.infer<typeof WorkerNodeSchema>;

export const WorkerRegistrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hostname: z.string(),
  ipAddress: TailscaleIpv4Schema,
  port: z.number().int().positive(),
  authToken: z.string().min(8),
  resources: WorkerResourcesSchema,
  limits: WorkerLimitsSchema,
  version: z.string().default('0.1.0'),
});
export type WorkerRegistration = z.infer<typeof WorkerRegistrationSchema>;

export const WorkerHeartbeatSchema = z.object({
  workerId: z.string().min(1),
  state: WorkerStateSchema,
  resources: WorkerResourcesSchema,
  activeWorkloadIds: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>;

export const WorkerStatusResponseSchema = z.object({
  success: z.boolean(),
  worker: WorkerNodeSchema.optional(),
  acknowledged: z.boolean().default(true),
  timestamp: z.string().datetime(),
});
export type WorkerStatusResponse = z.infer<typeof WorkerStatusResponseSchema>;
