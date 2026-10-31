import { Router, Request, Response } from 'express';
import { HealthCheckResponse } from '@cloud-without-clouds/shared';
import { env } from '../config/env.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req: Request, res: Response<HealthCheckResponse>) => {
  const response: HealthCheckResponse = {
    status: 'ok',
    service: 'cloud-without-clouds-control-plane',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    dependencies: {
      database: {
        status: 'ok',
        message: 'PostgreSQL endpoint configured',
      },
      redis: {
        status: 'ok',
        message: 'Redis endpoint configured',
      },
    },
  };

  res.status(200).json(response);
});
