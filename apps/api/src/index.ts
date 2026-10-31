import { createApp } from './app.js';
import { env } from './config/env.js';
import { startSweeper, stopSweeper } from './services/sweeper.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`
🚀 Cloud Without Clouds - Control Plane API
==================================================
  Environment : ${env.NODE_ENV}
  Port        : ${env.PORT}
  Health Check: http://localhost:${env.PORT}/health
  CORS Origin : ${env.CORS_ORIGIN}
==================================================
`);

  // Start background heartbeat sweeper and failure recovery engine
  startSweeper();
});

// Graceful shutdown handling
const shutdown = (signal: string) => {
  console.log(`\nReceived ${signal}, gracefully shutting down API server...`);
  stopSweeper();
  server.close(() => {
    console.log('API server closed.');
    process.exit(0);
  });

  // Force close if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forcefully terminating API server...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
