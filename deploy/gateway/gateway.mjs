#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const DEFAULT_CADDY_ADMIN = 'http://127.0.0.1:2019';
const DEFAULT_LISTENER_BASE = 18080;

export class GatewayError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function validateRouteInput(input) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(input.deploymentId)) {
    throw new GatewayError(400, 'INVALID_DEPLOYMENT_ID', 'deploymentId must be a safe route identifier');
  }
  if (!isTailscaleIpv4(input.upstreamIp)) {
    throw new GatewayError(400, 'INVALID_UPSTREAM_IP', 'upstreamIp must be a Tailscale IPv4 address');
  }
  if (!Number.isInteger(input.upstreamPort) || input.upstreamPort < 1 || input.upstreamPort > 65535) {
    throw new GatewayError(400, 'INVALID_UPSTREAM_PORT', 'upstreamPort must be between 1 and 65535');
  }
  const healthPath = input.healthPath ?? '/';
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%\-/]*$/.test(healthPath)) {
    throw new GatewayError(400, 'INVALID_HEALTH_PATH', 'healthPath must be an absolute HTTP path');
  }
  return { ...input, healthPath };
}

export function isTailscaleIpv4(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
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
  let body = '';
  for await (const chunk of request) body += chunk;
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
    this.routes.set(route.deploymentId, route);
    const config = this.#config();
    const result = await this.fetch(`${this.baseUrl}/load`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!result.ok) {
      this.routes.delete(route.deploymentId);
      throw new GatewayError(502, 'CADDY_UPDATE_FAILED', `Caddy rejected the route (${result.status})`);
    }
  }

  async remove(deploymentId) {
    this.routes.delete(deploymentId);
    const result = await this.fetch(`${this.baseUrl}/load`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.#config()),
    });
    if (!result.ok) throw new GatewayError(502, 'CADDY_UPDATE_FAILED', `Caddy rejected the route removal (${result.status})`);
  }

  #config() {
    const servers = {};
    for (const route of this.routes.values()) {
      servers[`cwc-${route.deploymentId}`] = {
        listen: [`127.0.0.1:${route.listenerPort}`],
        routes: [{
          match: [{ path: ['/*'] }],
          handle: [{
            handler: 'reverse_proxy',
            upstreams: [{ dial: `${route.upstreamIp}:${route.upstreamPort}` }],
            health_uri: route.healthPath,
            health_interval: '5s',
            health_timeout: '2s',
          }],
          terminal: true,
        }],
      };
    }
    return { admin: { listen: '127.0.0.1:2019' }, apps: { http: { servers } } };
  }
}

export class QuickTunnel {
  constructor(spawnImpl = spawn) {
    this.spawn = spawnImpl;
  }

  async start(listenerPort) {
    const child = this.spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${listenerPort}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const output = async function* () {
      for await (const chunk of child.stderr) yield chunk.toString();
      for await (const chunk of child.stdout) yield chunk.toString();
    }();
    let buffer = '';
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const next = await Promise.race([
        output.next(),
        once(child, 'exit').then(() => ({ done: true, value: '' })),
      ]);
      if (next.done) break;
      buffer += next.value;
      const match = buffer.match(/https:\/\/(?!api\.)[-a-z0-9]+\.trycloudflare\.com/i);
      if (match) return { url: match[0], stop: () => child.kill('SIGTERM') };
    }
    child.kill('SIGTERM');
    throw new GatewayError(502, 'TUNNEL_START_FAILED', 'cloudflared did not provide a public URL');
  }
}

export class RouteManager {
  constructor({ caddy, tunnel, probe = fetch, listenerBase = DEFAULT_LISTENER_BASE } = {}) {
    this.caddy = caddy ?? new CaddyAdminClient();
    this.tunnel = tunnel ?? new QuickTunnel();
    this.probe = probe;
    this.listenerBase = listenerBase;
    this.routes = new Map();
  }

  async publish(input) {
    const route = validateRouteInput(input);
    const target = `http://${route.upstreamIp}:${route.upstreamPort}${route.healthPath}`;
    let health;
    try {
      health = await this.probe(target, { signal: AbortSignal.timeout(2000) });
    } catch {
      throw new GatewayError(502, 'UPSTREAM_UNAVAILABLE', 'upstream health check failed');
    }
    if (!health.ok) throw new GatewayError(502, 'UPSTREAM_UNAVAILABLE', `upstream health check returned ${health.status}`);

    await this.remove(route.deploymentId, { ignoreMissing: true });
    const listenerPort = this.listenerBase + this.routes.size;
    const next = { ...route, listenerPort };
    await this.caddy.apply(next);
    let tunnel;
    try {
      tunnel = await this.tunnel.start(listenerPort);
    } catch (error) {
      await this.caddy.remove(route.deploymentId).catch(() => {});
      throw error;
    }
    const record = { ...next, status: 'ready', publicUrl: tunnel.url, stopTunnel: tunnel.stop };
    this.routes.set(route.deploymentId, record);
    return this.#public(record);
  }

  async remove(deploymentId, { ignoreMissing = false } = {}) {
    const record = this.routes.get(deploymentId);
    if (!record) {
      if (!ignoreMissing) throw new GatewayError(404, 'ROUTE_NOT_FOUND', 'deployment route was not found');
      return;
    }
    record.stopTunnel?.();
    await this.caddy.remove(deploymentId);
    this.routes.delete(deploymentId);
  }

  get(deploymentId) {
    const record = this.routes.get(deploymentId);
    if (!record) throw new GatewayError(404, 'ROUTE_NOT_FOUND', 'deployment route was not found');
    return this.#public(record);
  }

  #public(record) {
    return {
      deploymentId: record.deploymentId,
      status: record.status,
      publicUrl: record.publicUrl,
      listenerPort: record.listenerPort,
      upstreamIp: record.upstreamIp,
      upstreamPort: record.upstreamPort,
      healthPath: record.healthPath,
    };
  }
}

export function createGatewayServer({ manager = new RouteManager(), token = process.env.GATEWAY_TOKEN } = {}) {
  if (!token) throw new Error('GATEWAY_TOKEN is required');
  return createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== `Bearer ${token}`) {
        jsonResponse(response, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'valid gateway token required' } });
        return;
      }
      const match = request.url?.match(/^\/v1\/routes\/([^/]+)$/);
      if (!match) {
        jsonResponse(response, 404, { success: false, error: { code: 'NOT_FOUND', message: 'route not found' } });
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
        await manager.remove(deploymentId);
        jsonResponse(response, 200, { success: true, data: { deploymentId, status: 'removed' } });
        return;
      }
      jsonResponse(response, 405, { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'method not allowed' } });
    } catch (error) {
      const gatewayError = error instanceof GatewayError ? error : new GatewayError(500, 'GATEWAY_ERROR', 'gateway request failed');
      jsonResponse(response, gatewayError.status, { success: false, error: { code: gatewayError.code, message: gatewayError.message } });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createGatewayServer();
  const port = Number(process.env.GATEWAY_PORT ?? 4100);
  const host = process.env.GATEWAY_BIND_HOST ?? '127.0.0.1';
  server.listen(port, host, () => console.log(`Gateway service listening on ${host}:${port}`));
}
