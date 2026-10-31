import express, { Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { requestLogger } from './middlewares/request-logger.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { errorHandler } from './middlewares/error-handler.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // CORS Configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Body Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request Logging
  app.use(requestLogger);

  // Mount API Routes
  app.use(apiRouter);

  // 404 Handler
  app.use(notFoundHandler);

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}
