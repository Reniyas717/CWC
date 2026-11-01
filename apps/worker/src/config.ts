import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from workspace root if present, then local fallback
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const WorkerConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_ID: z.string().min(1).default('worker-node-local-01'),
  WORKER_NAME: z.string().min(1).default('Local Development Worker'),
  WORKER_PORT: z.coerce.number().int().positive().default(5001),
  CONTROL_PLANE_URL: z.string().url().default('http://100.124.251.107:4000'),
  WORKER_SECRET_TOKEN: z.string().min(8).default('dev-worker-secret-token-change-in-production'),
  MAX_CONCURRENT_WORKLOADS: z.coerce.number().int().positive().default(4),
  TOTAL_MEMORY_LIMIT_MB: z.coerce.number().int().positive().default(4096),
  MAX_CPU_CORES: z.coerce
    .number()
    .positive()
    .default(Math.max(1, os.cpus().length || 2)),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
  RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

const parsed = WorkerConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[Worker:Config] ❌ Invalid worker environment configuration:');
  const formatted = parsed.error.format();
  for (const [key, value] of Object.entries(formatted)) {
    if (key !== '_errors' && value && '_errors' in value) {
      console.error(`  - ${key}: ${(value as { _errors: string[] })._errors.join(', ')}`);
    }
  }
  process.exit(1);
}

export const workerConfig: WorkerConfig = parsed.data;
// Alias for backwards compatibility
export const workerEnv = workerConfig;
