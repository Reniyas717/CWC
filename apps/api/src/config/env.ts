import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Load .env from workspace root if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // Fallback to current working directory

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .optional()
    .default(
      'postgresql://cwc_user:cwc_password@localhost:5432/cloud_without_clouds?schema=public'
    ),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  ADMIN_TOKEN: z.string().min(8).default('dev-admin-token-change-in-production'),
  WORKER_SECRET_TOKEN: z.string().min(8).default('dev-worker-secret-token-change-in-production'),
  GATEWAY_URL: z.string().default('http://localhost:5050'),
  GATEWAY_TOKEN: z.string().default('dev-gateway-secret-token-change-in-production'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().min(32).default('development-session-secret-change-before-deploy'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
