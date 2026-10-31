import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_ID: z.string().default('worker-node-local-01'),
  WORKER_NAME: z.string().default('Local Development Worker'),
  WORKER_PORT: z.coerce.number().int().positive().default(5001),
  CONTROL_PLANE_URL: z.string().url().default('http://localhost:4000'),
  WORKER_SECRET_TOKEN: z.string().min(8).default('dev-worker-secret-token-change-in-production'),
  MAX_CONCURRENT_WORKLOADS: z.coerce.number().int().positive().default(4),
  TOTAL_MEMORY_LIMIT_MB: z.coerce.number().int().positive().default(4096),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

const parsed = WorkerEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid worker environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const workerEnv = parsed.data;
