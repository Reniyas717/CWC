import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'admin';
  };
}

/**
 * Extracts a Bearer token from the incoming Authorization header.
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) {
    return parts[1];
  }
  return null;
}

/**
 * Requires a valid ADMIN_TOKEN Bearer token.
 * Protects user/admin mutating operations (e.g. creating/cancelling deployments).
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token || token !== env.ADMIN_TOKEN) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Valid admin authorization token required',
      },
    });
    return;
  }

  // Attach default admin identity to request
  req.user = { id: 'admin', role: 'admin' };
  next();
}

/**
 * Requires a valid WORKER_SECRET_TOKEN Bearer token.
 * Protects worker registration, heartbeat, task polling, and deployment reporting endpoints.
 */
export function requireWorker(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (!token || token !== env.WORKER_SECRET_TOKEN) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Valid worker secret authorization token required',
      },
    });
    return;
  }

  next();
}

/**
 * Optional admin authorization for read-only endpoints in local development mode.
 * If Authorization header is sent, it must be valid; otherwise allows in development.
 */
export function optionalAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);

  if (token) {
    if (token !== env.ADMIN_TOKEN) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid admin authorization token',
        },
      });
      return;
    }
    req.user = { id: 'admin', role: 'admin' };
    return next();
  }

  // Open in development mode for easier UI inspection
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
    return next();
  }

  res.status(401).json({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authorization token required in production environment',
    },
  });
}
