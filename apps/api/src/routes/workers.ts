import { Router, Request, Response } from 'express';
import { requireWorker, optionalAdmin } from '../middlewares/auth.js';

export const workersRouter: Router = Router();

// Read worker nodes (open in dev, protected by optionalAdmin)
workersRouter.get('/', optionalAdmin, (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: [],
    message: 'Worker management ready for node registration',
  });
});

// Worker registration (requires WORKER_SECRET_TOKEN)
workersRouter.post('/register', requireWorker, (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Worker registration endpoint placeholder - implementation in upcoming phase',
  });
});

// Worker heartbeat (requires WORKER_SECRET_TOKEN)
workersRouter.post('/heartbeat', requireWorker, (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Worker heartbeat endpoint placeholder - implementation in upcoming phase',
  });
});

// Worker state transition (requires WORKER_SECRET_TOKEN)
workersRouter.post('/status', requireWorker, (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    message: 'Worker status transition endpoint placeholder - implementation in upcoming phase',
  });
});

// Worker task polling (requires WORKER_SECRET_TOKEN)
workersRouter.get('/:id/tasks', requireWorker, (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    hasTask: false,
    message: 'Worker task polling endpoint ready',
  });
});
