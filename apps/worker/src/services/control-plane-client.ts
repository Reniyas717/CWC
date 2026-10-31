import {
  DeploymentLogsPayload,
  DeploymentLogsPayloadSchema,
  DeploymentResultPayload,
  DeploymentResultPayloadSchema,
  DeploymentTaskResponse,
  DeploymentTaskResponseSchema,
  WorkerHeartbeat,
  WorkerHeartbeatSchema,
  WorkerRegistration,
  WorkerRegistrationSchema,
  WorkerState,
} from '@cloud-without-clouds/shared';
import { workerConfig } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ControlPlaneClient');

export interface ApiResponse<T = unknown> {
  ok: boolean;
  statusCode: number;
  data?: T;
  error?: string;
  isNotImplemented?: boolean;
}

export class ControlPlaneClient {
  private baseUrl: string;
  private secretToken: string;
  private maxRetries: number;
  private retryBackoffMs: number;

  constructor() {
    this.baseUrl = workerConfig.CONTROL_PLANE_URL.replace(/\/+$/, '');
    this.secretToken = workerConfig.WORKER_SECRET_TOKEN;
    this.maxRetries = workerConfig.MAX_RETRIES;
    this.retryBackoffMs = workerConfig.RETRY_BACKOFF_MS;
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.secretToken}`,
    };
  }

  /**
   * Executes a fetch request with bounded retry and exponential backoff for transient errors.
   */
  private async requestWithRetry<T>(
    endpoint: string,
    options: RequestInit,
    timeoutMs: number = 5000
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let responseBody: unknown = null;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            responseBody = await response.json();
          } catch {
            responseBody = null;
          }
        }

        if (response.ok) {
          return {
            ok: true,
            statusCode: response.status,
            data: responseBody as T,
          };
        }

        // Endpoint is not implemented yet (e.g. 501 Not Implemented)
        if (response.status === 501) {
          return {
            ok: false,
            statusCode: 501,
            isNotImplemented: true,
            error: 'Endpoint not implemented on Control Plane',
          };
        }

        // 404 Not Found (endpoint not yet created by Control Plane teammate)
        if (response.status === 404) {
          return {
            ok: false,
            statusCode: 404,
            isNotImplemented: true,
            error: 'Endpoint not found on Control Plane',
          };
        }

        // Authentication failure (401 or 403) - do not retry
        if (response.status === 401 || response.status === 403) {
          logger.error(`Authentication rejected on ${endpoint} (${response.status})`);
          return {
            ok: false,
            statusCode: response.status,
            error: `Authentication rejected (${response.status})`,
          };
        }

        // Server errors (500, 502, 503, 504) - eligible for retry
        if (response.status >= 500 && attempt < this.maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = Math.min(10000, this.retryBackoffMs * Math.pow(2, attempt - 1) + jitter);
          logger.warn(
            `Transient error ${response.status} from ${endpoint}. Retrying in ${Math.round(delay)}ms (attempt ${attempt}/${this.maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return {
          ok: false,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
          data: responseBody as T,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const errorDesc = isAbort ? `Request timeout (${timeoutMs}ms)` : (err instanceof Error ? err.message : String(err));

        if (attempt < this.maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = Math.min(10000, this.retryBackoffMs * Math.pow(2, attempt - 1) + jitter);
          logger.warn(
            `Network error calling ${endpoint}: ${errorDesc}. Retrying in ${Math.round(delay)}ms (attempt ${attempt}/${this.maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          return {
            ok: false,
            statusCode: 0,
            error: errorDesc,
          };
        }
      }
    }

    return {
      ok: false,
      statusCode: 0,
      error: 'Max retries exhausted',
    };
  }

  /**
   * Health check on Control Plane root /health.
   */
  public async checkHealth(): Promise<boolean> {
    try {
      const res = await this.requestWithRetry<{ status: string }>('/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Registers worker with the Control Plane API.
   * Path: POST /api/v1/workers/register
   */
  public async register(payload: WorkerRegistration): Promise<ApiResponse> {
    const validated = WorkerRegistrationSchema.parse(payload);
    logger.info(`Sending worker registration for ${validated.id} to ${this.baseUrl}/api/v1/workers/register...`, {
      workerId: validated.id,
      port: validated.port,
      hostname: validated.hostname,
    });

    return this.requestWithRetry('/api/v1/workers/register', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(validated),
    });
  }

  /**
   * Sends periodic telemetry heartbeat to Control Plane.
   * Path: POST /api/v1/workers/heartbeat
   */
  public async sendHeartbeat(payload: WorkerHeartbeat): Promise<ApiResponse> {
    const validated = WorkerHeartbeatSchema.parse(payload);
    logger.debug(`Sending heartbeat for ${validated.workerId}...`, {
      state: validated.state,
      cpuUsage: `${validated.resources.cpuUsagePercent}%`,
      freeMemory: `${validated.resources.freeMemoryMb}MB`,
      activeWorkloads: validated.activeWorkloadIds.length,
    });

    return this.requestWithRetry('/api/v1/workers/heartbeat', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(validated),
    });
  }

  /**
   * Explicit status update (e.g. draining or offline).
   * Path: POST /api/v1/workers/status
   */
  public async sendStatus(
    workerId: string,
    state: WorkerState,
    details?: string
  ): Promise<ApiResponse> {
    logger.info(`Sending status update: ${workerId} -> ${state}`, { details });
    return this.requestWithRetry(
      '/api/v1/workers/status',
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          workerId,
          state,
          details,
          timestamp: new Date().toISOString(),
        }),
      },
      2000
    );
  }

  /**
   * Polls Control Plane for pending deployment tasks for this worker.
   * Path: GET /api/v1/workers/:id/tasks
   */
  public async pollTasks(workerId: string): Promise<ApiResponse<DeploymentTaskResponse>> {
    const res = await this.requestWithRetry<unknown>(`/api/v1/workers/${workerId}/tasks`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (res.ok && res.data) {
      const parsed = DeploymentTaskResponseSchema.safeParse(res.data);
      if (parsed.success) {
        return {
          ...res,
          data: parsed.data,
        };
      }
    }

    return res as ApiResponse<DeploymentTaskResponse>;
  }

  /**
   * Reports final or transition result of a deployment to the Control Plane.
   * Path: POST /api/v1/internal/deployments/:id/result
   */
  public async reportResult(payload: DeploymentResultPayload): Promise<ApiResponse> {
    const validated = DeploymentResultPayloadSchema.parse(payload);
    logger.info(`Reporting deployment result for ${validated.deploymentId} (${validated.state})...`, {
      deploymentId: validated.deploymentId,
      state: validated.state,
      port: validated.assignedPort,
      containerId: validated.containerId,
    });

    return this.requestWithRetry(`/api/v1/internal/deployments/${validated.deploymentId}/result`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(validated),
    });
  }

  /**
   * Flushes deployment build and runtime logs to the Control Plane.
   * Path: POST /api/v1/internal/deployments/:id/logs
   */
  public async sendLogs(payload: DeploymentLogsPayload): Promise<ApiResponse> {
    const validated = DeploymentLogsPayloadSchema.parse(payload);
    return this.requestWithRetry(`/api/v1/internal/deployments/${validated.deploymentId}/logs`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(validated),
    });
  }
}
