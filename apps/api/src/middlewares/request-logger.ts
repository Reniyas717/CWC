import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, url, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const color =
      statusCode >= 500
        ? '\x1b[31m' // Red
        : statusCode >= 400
          ? '\x1b[33m' // Yellow
          : statusCode >= 300
            ? '\x1b[36m' // Cyan
            : '\x1b[32m'; // Green
    const reset = '\x1b[0m';

    console.log(
      `[${new Date().toISOString()}] ${method} ${url} ${color}${statusCode}${reset} - ${duration}ms (${ip})`
    );
  });

  next();
}
