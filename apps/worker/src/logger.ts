import { workerConfig } from './config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEYS = new Set([
  'token',
  'authtoken',
  'worker_secret_token',
  'secret',
  'password',
  'authorization',
  'apikey',
]);

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (workerConfig.WORKER_SECRET_TOKEN && value.includes(workerConfig.WORKER_SECRET_TOKEN)) {
      return value.replaceAll(workerConfig.WORKER_SECRET_TOKEN, '***REDACTED***');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = '***REDACTED***';
      } else {
        result[key] = sanitizeValue(val);
      }
    }
    return result;
  }

  return value;
}

export class Logger {
  private moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  private shouldLog(level: LogLevel): boolean {
    const currentPriority = LOG_LEVEL_PRIORITY[workerConfig.LOG_LEVEL] ?? 1;
    return LOG_LEVEL_PRIORITY[level] >= currentPriority;
  }

  private formatMessage(message: string): string {
    return `[${this.moduleName}] ${message}`;
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    if (context) {
      console.debug(this.formatMessage(message), sanitizeValue(context));
    } else {
      console.debug(this.formatMessage(message));
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    if (context) {
      console.log(this.formatMessage(message), sanitizeValue(context));
    } else {
      console.log(this.formatMessage(message));
    }
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    if (context) {
      console.warn(this.formatMessage(message), sanitizeValue(context));
    } else {
      console.warn(this.formatMessage(message));
    }
  }

  public error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    const sanitizedContext = context ? sanitizeValue(context) : undefined;
    const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : error;

    if (error && sanitizedContext) {
      console.error(this.formatMessage(message), { error: errorMessage, ...sanitizedContext });
    } else if (error) {
      console.error(this.formatMessage(message), { error: errorMessage });
    } else if (sanitizedContext) {
      console.error(this.formatMessage(message), sanitizedContext);
    } else {
      console.error(this.formatMessage(message));
    }
  }
}

export function createLogger(moduleName: string): Logger {
  return new Logger(moduleName);
}
