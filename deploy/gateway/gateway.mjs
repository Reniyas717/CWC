#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_CADDY_ADMIN = 'http://127.0.0.1:2019';
const DEFAULT_LISTENER_BASE = 18080;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export class GatewayError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ReconciliationError extends GatewayError {
  constructor(message = 'authoritative deployment state is unavailable') {
    super(503, 'RECONCILIATION_UNAVAILABLE', message);
  }
}

export function validateRouteInput(input, { allowLocal = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GatewayError(400, 'INVALID_ROUTE', 'route input must be an object');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(input.deploymentId)) {
    throw new GatewayError(
      400,
      'INVALID_DEPLOYMENT_ID',
      'deploymentId must be a safe route identifier'
    );
  }
  const isLocal =
    allowLocal && (input.upstreamIp === '127.0.0.1' || input.upstreamIp === 'localhost');
  if (!isTailscaleIpv4(input.upstreamIp) && !isLocal) {
    throw new GatewayError(
      400,
      'INVALID_UPSTREAM_IP',
      'upstreamIp must be a Tailscale IPv4 address'
    );
  }
  if (
    !Number.isInteger(input.upstreamPort) ||
    input.upstreamPort < 1 ||
    input.upstreamPort > 65535
  ) {
    throw new GatewayError(
      400,
      'INVALID_UPSTREAM_PORT',
      'upstreamPort must be between 1 and 65535'
    );
  }
  const healthPath = input.healthPath ?? '/';
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%\-/]*$/.test(healthPath)) {
    throw new GatewayError(400, 'INVALID_HEALTH_PATH', 'healthPath must be an absolute HTTP path');
  }
  if (
    input.attemptId !== undefined &&
    (typeof input.attemptId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.attemptId))
  ) {
    throw new GatewayError(
      400,
      'INVALID_ATTEMPT_ID',
      'attemptId must be a safe route attempt identifier'
    );
  }
  return { ...input, healthPath };
}

export function isTailscaleIpv4(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255))
    return false;
  const number = parts.reduce((result, part) => result * 256 + Number(part), 0);
  return number >= 0x64400000 && number <= 0x647fffff;
}

function jsonResponse(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readJson(request) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new GatewayError(413, 'REQUEST_BODY_TOO_LARGE', 'request body exceeds 1 MiB');
  }
  let body = '';
  let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      throw new GatewayError(413, 'REQUEST_BODY_TOO_LARGE', 'request body exceeds 1 MiB');
    }
    body += chunk;
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new GatewayError(400, 'INVALID_JSON', 'request body must be valid JSON');
  }
}

export class CaddyAdminClient {
  constructor(baseUrl = DEFAULT_CADDY_ADMIN, fetchImpl = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.routes = new Map();
  }

  async apply(route) {
    const previous = this.routes.get(route.deploymentId);
    this.routes.set(route.deploymentId, route);
    const config = this.#config();
    let result;
    try {
      result = await this.fetch(`${this.baseUrl}/load`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: this.baseUrl },
        body: JSON.stringify(config),
      });
    } catch (error) {
      if (previous) this.routes.set(route.deploymentId, previous);
      else this.routes.delete(route.deploymentId);
      throw new GatewayError(502, 'CADDY_UPDATE_FAILED', `Caddy update failed: ${error.message}`);
    }
    if (!result.ok) {
      if (previous) this.routes.set(route.deploymentId, previous);
      else this.routes.delete(route.deploymentId);
      throw new GatewayError(
        502,
        'CADDY_UPDATE_FAILED',
        `Caddy rejected the route (${result.status})`
      );
    }
  }

  async remove(deploymentId) {
    const previous = this.routes.get(deploymentId);
    this.routes.delete(deploymentId);
    let result;
    try {
      result = await this.fetch(`${this.baseUrl}/load`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: this.baseUrl },
        body: JSON.stringify(this.#config()),
      });
    } catch (error) {
      if (previous) this.routes.set(deploymentId, previous);
      throw new GatewayError(
        502,
        'CADDY_UPDATE_FAILED',
        `Caddy route removal failed: ${error.message}`
      );
    }
    if (!result.ok) {
      if (previous) this.routes.set(deploymentId, previous);
      throw new GatewayError(
        502,
        'CADDY_UPDATE_FAILED',
        `Caddy rejected the route removal (${result.status})`
      );
    }
  }

  async clear() {
    const previous = this.routes;
    this.routes = new Map();
    let result;
    try {
      result = await this.fetch(`${this.baseUrl}/load`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: this.baseUrl },
        body: JSON.stringify(this.#config()),
      });
    } catch (error) {
      this.routes = previous;
      throw new GatewayError(
        502,
        'CADDY_UPDATE_FAILED',
        `Caddy route reset failed: ${error.message}`
      );
    }
    if (!result.ok) {
      this.routes = previous;
      throw new GatewayError(
        502,
        'CADDY_UPDATE_FAILED',
        `Caddy rejected route reset (${result.status})`
      );
    }
  }

  #config() {
    const servers = {};
    for (const route of this.routes.values()) {
      servers[`cwc-${route.deploymentId}`] = {
        listen: [`127.0.0.1:${route.listenerPort}`],
        routes: [
          {
            match: [{ path: ['/*'] }],
            handle: [
              {
                handler: 'reverse_proxy',
                upstreams: [{ dial: `${route.upstreamIp}:${route.upstreamPort}` }],
                health_checks: {
                  active: {
                    uri: route.healthPath,
                    interval: '5s',
                    timeout: '2s',
                  },
                },
              },
            ],
            terminal: true,
          },
        ],
      };
    }
    return { admin: { listen: '127.0.0.1:2019' }, apps: { http: { servers } } };
  }
}

export class QuickTunnel {
  constructor(spawnImpl = spawn) {
    this.spawn = spawnImpl;
  }

  async start(listenerPort, { onExit } = {}) {
    let child;
    let command = 'cloudflared';
    let options = { stdio: ['ignore', 'pipe', 'pipe'] };
    if (process.platform === 'win32') {
      const nativeBinary = join(
        process.env.APPDATA || '',
        'npm/node_modules/cloudflared/bin/cloudflared.exe'
      );
      if (existsSync(nativeBinary)) {
        command = nativeBinary;
      } else {
        command = 'cloudflared.cmd';
        options = { stdio: ['ignore', 'pipe', 'pipe'], shell: true };
      }
    }
    try {
      child = this.spawn(command, ['tunnel', '--url', `http://127.0.0.1:${listenerPort}`], options);
    } catch (error) {
      throw new GatewayError(
        502,
        'TUNNEL_START_FAILED',
        `unable to start cloudflared: ${error.message}`
      );
    }
    let stopped = false;
    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };
      const onData = (chunk) => {
        buffer = `${buffer}${chunk.toString()}`.slice(-4096);
        const match = buffer.match(/https:\/\/(?!api\.)[-a-z0-9]+\.trycloudflare\.com/i);
        if (match)
          finish(resolve, {
            url: match[0],
            stop: () => {
              stopped = true;
              if (process.platform === 'win32' && child?.pid) {
                spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
              }
              child?.kill?.('SIGTERM');
            },
          });
      };
      const onError = (error) =>
        finish(
          reject,
          new GatewayError(502, 'TUNNEL_START_FAILED', `cloudflared failed: ${error.message}`)
        );
      const handleExit = (code) => {
        if (!stopped) {
          onExit?.();
          if (!settled)
            finish(
              reject,
              new GatewayError(
                502,
                'TUNNEL_START_FAILED',
                `cloudflared exited before publishing a URL (${code ?? 'unknown'})`
              )
            );
        }
      };
      const timeout = setTimeout(() => {
        stopped = true;
        if (process.platform === 'win32' && child?.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        }
        child?.kill?.('SIGTERM');
        finish(
          reject,
          new GatewayError(
            502,
            'TUNNEL_START_FAILED',
            'cloudflared did not provide a public URL within 15 seconds'
          )
        );
      }, 15000);
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.once('error', onError);
      child.once('exit', handleExit);
    });
  }
}

export class RouteManager {
  constructor({
    caddy,
    tunnel,
    probe = fetch,
    listenerBase = DEFAULT_LISTENER_BASE,
    allowLocal = process.env.GATEWAY_ALLOW_LOCAL === 'true' ||
      process.env.NODE_ENV !== 'production',
  } = {}) {
    this.caddy = caddy ?? new CaddyAdminClient();
    this.tunnel = tunnel ?? new QuickTunnel();
    this.probe = probe;
    this.listenerBase = listenerBase;
    this.allowLocal = allowLocal;
    this.routes = new Map();
    this.nextListenerOffset = 0;
    this.mutation = Promise.resolve();
  }

  async publish(input) {
    return this.#enqueue(() => this.#publish(input));
  }

  #enqueue(operation) {
    const result = this.mutation.then(operation, operation);
    this.mutation = result.catch(() => {});
    return result;
  }

  async #publish(input) {
    const route = validateRouteInput(input, { allowLocal: this.allowLocal });
    const target = `http://${route.upstreamIp}:${route.upstreamPort}${route.healthPath}`;
    let health;
    try {
      health = await this.probe(target, { signal: AbortSignal.timeout(2000) });
    } catch (probeError) {
      if (route.upstreamIp === '127.0.0.1') {
        const fallbackTarget = `http://localhost:${route.upstreamPort}${route.healthPath}`;
        try {
          health = await this.probe(fallbackTarget, { signal: AbortSignal.timeout(2000) });
        } catch {
          console.warn(
            `[Gateway] Health check probe failed for ${target}:`,
            probeError?.cause
              ? probeError.cause
              : probeError instanceof Error
                ? probeError.message
                : String(probeError)
          );
          throw new GatewayError(502, 'UPSTREAM_UNAVAILABLE', 'upstream health check failed');
        }
      } else {
        console.warn(
          `[Gateway] Health check probe failed for ${target}:`,
          probeError?.cause
            ? probeError.cause
            : probeError instanceof Error
              ? probeError.message
              : String(probeError)
        );
        throw new GatewayError(502, 'UPSTREAM_UNAVAILABLE', 'upstream health check failed');
      }
    }
    if (!health.ok)
      throw new GatewayError(
        502,
        'UPSTREAM_UNAVAILABLE',
        `upstream health check returned ${health.status}`
      );

    const previous = this.routes.get(route.deploymentId);
    const listenerPort = this.listenerBase + this.nextListenerOffset;
    this.nextListenerOffset += 1;
    const next = {
      ...route,
      listenerPort,
      status: 'starting',
      publicUrl: undefined,
      retryTimer: undefined,
      retryAttempt: 0,
      cancelled: false,
    };
    await this.caddy.apply(next);
    let tunnel;
    let activeRecord = next;
    try {
      tunnel = await this.tunnel.start(listenerPort, {
        onExit: () => this.#scheduleRestart(route.deploymentId, activeRecord),
      });
    } catch (error) {
      if (previous) await this.caddy.apply(previous).catch(() => {});
      else await this.caddy.remove(route.deploymentId).catch(() => {});
      throw error;
    }
    const record = { ...next, status: 'ready', publicUrl: tunnel.url, stopTunnel: tunnel.stop };
    activeRecord = record;
    this.#cancelRecord(previous);
    this.routes.set(route.deploymentId, record);
    return this.#public(record);
  }

  async restartTunnel(deploymentId) {
    return this.#enqueue(() => this.#restartTunnel(deploymentId));
  }

  async #restartTunnel(deploymentId) {
    const record = this.routes.get(deploymentId);
    if (!record || record.cancelled) return;
    record.status = 'restarting';
    record.publicUrl = undefined;
    record.stopTunnel?.();
    record.stopTunnel = undefined;
    try {
      const tunnel = await this.tunnel.start(record.listenerPort, {
        onExit: () => this.#scheduleRestart(deploymentId, record),
      });
      if (record.cancelled || this.routes.get(deploymentId) !== record) {
        tunnel.stop();
        return;
      }
      record.stopTunnel = tunnel.stop;
      record.publicUrl = tunnel.url;
      record.retryAttempt = 0;
      record.status = 'ready';
      return this.#public(record);
    } catch {
      this.#scheduleRestart(deploymentId, record, record.retryAttempt + 1);
    }
  }

  #scheduleRestart(deploymentId, record, attempt = 0) {
    if (
      !record ||
      record.cancelled ||
      this.routes.get(deploymentId) !== record ||
      record.retryTimer
    )
      return;
    const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 15000);
    record.status = 'restarting';
    record.publicUrl = undefined;
    record.retryAttempt = attempt;
    record.retryTimer = setTimeout(() => {
      record.retryTimer = undefined;
      this.restartTunnel(deploymentId).catch(() =>
        this.#scheduleRestart(deploymentId, record, attempt + 1)
      );
    }, delay);
  }

  #cancelRecord(record) {
    if (!record) return;
    record.cancelled = true;
    if (record.retryTimer) clearTimeout(record.retryTimer);
    record.retryTimer = undefined;
    record.stopTunnel?.();
    record.stopTunnel = undefined;
  }

  async remove(deploymentId, { ignoreMissing = false, attemptId } = {}) {
    return this.#enqueue(() => this.#remove(deploymentId, { ignoreMissing, attemptId }));
  }

  async #remove(deploymentId, { ignoreMissing = false, attemptId } = {}) {
    const record = this.routes.get(deploymentId);
    if (!record) {
      if (!ignoreMissing)
        throw new GatewayError(404, 'ROUTE_NOT_FOUND', 'deployment route was not found');
      return { status: 'removed' };
    }
    if (attemptId !== undefined && record.attemptId !== attemptId) {
      return { status: 'superseded', attemptId: record.attemptId };
    }
    await this.caddy.remove(deploymentId);
    this.#cancelRecord(record);
    this.routes.delete(deploymentId);
    return { status: 'removed' };
  }

  /**
   * Restore routes only from the control plane's authoritative state provider.
   * A provider failure leaves the manager empty so a stale local snapshot can
   * never become publicly reachable after a restart.
   */
  async reconcile(stateProvider) {
    return this.#enqueue(() => this.#reconcile(stateProvider));
  }

  async #reconcile(stateProvider) {
    if (typeof stateProvider !== 'function') {
      throw new ReconciliationError('an authoritative state provider is required');
    }

    let desired;
    try {
      desired = await stateProvider();
    } catch {
      try {
        await this.#clearRoutes();
      } catch {
        throw new ReconciliationError(
          'authoritative state unavailable and stale routes could not be cleared'
        );
      }
      this.routes.clear();
      throw new ReconciliationError();
    }
    if (!Array.isArray(desired)) {
      throw new GatewayError(
        400,
        'INVALID_RECONCILIATION',
        'routes must be an array of deployments'
      );
    }

    const validated = desired.map((route) =>
      validateRouteInput(route, { allowLocal: this.allowLocal })
    );

    await this.#clearRoutes();
    const restored = [];
    try {
      for (const route of validated) restored.push(await this.#publish(route));
    } catch (error) {
      for (const deploymentId of [...this.routes.keys()])
        await this.#remove(deploymentId, { ignoreMissing: true }).catch(() => {});
      throw error;
    }
    return restored;
  }

  async #clearRoutes() {
    for (const record of this.routes.values()) this.#cancelRecord(record);
    if (typeof this.caddy.clear === 'function') {
      await this.caddy.clear();
    } else {
      for (const deploymentId of this.routes.keys()) await this.caddy.remove(deploymentId);
    }
    this.routes.clear();
  }

  get(deploymentId) {
    const record = this.routes.get(deploymentId);
    if (!record) throw new GatewayError(404, 'ROUTE_NOT_FOUND', 'deployment route was not found');
    return this.#public(record);
  }

  #public(record) {
    return {
      deploymentId: record.deploymentId,
      ...(record.attemptId ? { attemptId: record.attemptId } : {}),
      status: record.status,
      publicUrl: record.publicUrl,
      listenerPort: record.listenerPort,
      upstreamIp: record.upstreamIp,
      upstreamPort: record.upstreamPort,
      healthPath: record.healthPath,
    };
  }
}

export function createGatewayServer({
  manager = new RouteManager(),
  token = process.env.GATEWAY_TOKEN,
} = {}) {
  if (!token) throw new Error('GATEWAY_TOKEN is required');
  return createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== `Bearer ${token}`) {
        jsonResponse(response, 401, {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'valid gateway token required' },
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/reconcile') {
        const body = await readJson(request);
        const result = await manager.reconcile(async () => body.routes);
        jsonResponse(response, 200, { success: true, data: result });
        return;
      }
      const parsedUrl = new URL(request.url ?? '/', 'http://gateway');
      const match = parsedUrl.pathname.match(/^\/v1\/routes\/([^/]+)$/);
      if (!match) {
        jsonResponse(response, 404, {
          success: false,
          error: { code: 'NOT_FOUND', message: 'route not found' },
        });
        return;
      }
      const deploymentId = decodeURIComponent(match[1]);
      if (request.method === 'POST' || request.method === 'PUT') {
        const body = await readJson(request);
        const result = await manager.publish({ ...body, deploymentId });
        jsonResponse(response, 201, { success: true, data: result });
        return;
      }
      if (request.method === 'GET') {
        jsonResponse(response, 200, { success: true, data: manager.get(deploymentId) });
        return;
      }
      if (request.method === 'DELETE') {
        const attemptId = parsedUrl.searchParams.get('attemptId') ?? undefined;
        const result = await manager.remove(deploymentId, { ignoreMissing: true, attemptId });
        jsonResponse(response, 200, { success: true, data: { deploymentId, ...result } });
        return;
      }
      jsonResponse(response, 405, {
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'method not allowed' },
      });
    } catch (error) {
      const gatewayError =
        error instanceof GatewayError
          ? error
          : new GatewayError(500, 'GATEWAY_ERROR', 'gateway request failed');
      jsonResponse(response, gatewayError.status, {
        success: false,
        error: { code: gatewayError.code, message: gatewayError.message },
      });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const manager = new RouteManager();
  const server = createGatewayServer({ manager });
  const port = Number(process.env.GATEWAY_PORT ?? 4100);
  const host = process.env.GATEWAY_BIND_HOST ?? '127.0.0.1';
  if (host !== '127.0.0.1' && !isTailscaleIpv4(host)) {
    throw new Error('GATEWAY_BIND_HOST must be 127.0.0.1 or a Tailscale IPv4 address');
  }
  manager.caddy
    .clear()
    .then(() => {
      server.listen(port, host, () => console.log(`Gateway service listening on ${host}:${port}`));
    })
    .catch((error) => {
      console.error(`Gateway startup failed: ${error.message}`);
      process.exitCode = 1;
    });
}
