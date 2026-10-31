import { Router, Request, Response } from 'express';
import { HealthCheckResponse } from '@cloud-without-clouds/shared';
import { env } from '../config/env.js';
import { checkDatabaseConnection } from '../db/index.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', async (_req: Request, res: Response<HealthCheckResponse>) => {
  const dbHealth = await checkDatabaseConnection();

  const response: HealthCheckResponse = {
    status: dbHealth.healthy ? 'ok' : 'degraded',
    service: 'cloud-without-clouds-control-plane',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    dependencies: {
      database: {
        status: dbHealth.healthy ? 'ok' : 'degraded',
        message: dbHealth.healthy
          ? `PostgreSQL connected (${dbHealth.latencyMs}ms)`
          : `PostgreSQL offline: ${dbHealth.error ?? 'unreachable'}`,
      },
      redis: {
        status: 'ok',
        message: 'Redis endpoint configured',
      },
    },
  };

  res.status(200).json(response);
});
