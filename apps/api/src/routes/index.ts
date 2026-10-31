import { Router } from 'express';
import { healthRouter } from './health.js';
import { workersRouter } from './workers.js';
import { applicationsRouter } from './applications.js';
import { deploymentsRouter } from './deployments.js';
import { internalDeploymentsRouter } from './internal-deployments.js';

export const apiRouter: Router = Router();

// Mount root health check
apiRouter.use(healthRouter);

// Mount modular feature routes under /api/v1
apiRouter.use('/api/v1/workers', workersRouter);
apiRouter.use('/api/v1/applications', applicationsRouter);
apiRouter.use('/api/v1/deployments', deploymentsRouter);
apiRouter.use('/api/v1/internal/deployments', internalDeploymentsRouter);
