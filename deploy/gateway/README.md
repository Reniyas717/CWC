# Gateway service

The gateway runs on Laptop 4 in Ubuntu/WSL. Install Node.js, Caddy and
`cloudflared` using their official Ubuntu instructions. Keep Caddy's admin API
on `127.0.0.1:2019`; expose only the gateway service on the Tailscale
interface and protect it with `GATEWAY_TOKEN`. The default service bind is
loopback for local tests. When the control plane runs on another laptop, set
`GATEWAY_BIND_HOST` to the gateway's current Tailscale IPv4, discovered with
`tailscale ip -4` (for Laptop 4, currently `100.70.86.53`). Never use
`0.0.0.0`.

Start the service for a local test with:

```bash
GATEWAY_TOKEN=replace-me GATEWAY_BIND_HOST=127.0.0.1 node deploy/gateway/gateway.mjs
```

For remote control-plane access, use the current Tailscale address instead:

```bash
GATEWAY_TOKEN=replace-me GATEWAY_BIND_HOST="$(tailscale ip -4)" node deploy/gateway/gateway.mjs
```

The control plane calls `POST /v1/routes/<deployment-id>` with an upstream
Tailscale IPv4 address, assigned host port, and optional `healthPath` (default
`/`). The response contains `status` (`ready` or `restarting`) and the current
temporary Quick Tunnel `publicUrl`. `DELETE /v1/routes/<deployment-id>` removes
a stopped route. All requests require `Authorization: Bearer $GATEWAY_TOKEN`.

The worker-to-control-plane handoff should provide these values when a
deployment is running:

```json
{
  "deploymentId": "demo",
  "workerTailscaleIp": "100.70.86.53",
  "assignedPort": 32768,
  "healthPath": "/"
}
```

The control plane should only call the route endpoint after the worker reports
`running`. A successful gateway response means the public route is `ready`;
an error means the app may still be running but is not publicly reachable.
When a tunnel restarts, the gateway's route status exposes the replacement
`publicUrl`; the control plane should persist and surface that URL to the
dashboard. These fields and any shared `routingStatus` enum require agreement
before changing `packages/shared`.

On gateway restart, the control plane must call `POST /v1/reconcile` with its
authoritative current deployment records. The gateway does not restore a local
snapshot. If reconciliation fails, it clears in-memory routes and returns
`RECONCILIATION_UNAVAILABLE`, leaving stale routes unpublished. Successful
records are health-checked before routes and tunnels are restored.
The reconciliation body is trusted only after the gateway token authenticates
the control plane; do not expose this endpoint to untrusted clients or accept
worker-originated reconciliation data directly.

For a systemd installation, copy `gateway.service.example` to
`/etc/systemd/system/cloud-without-clouds-gateway.service`, create the
environment file with a secret `GATEWAY_TOKEN` and the current
`GATEWAY_BIND_HOST=$(tailscale ip -4)`, then enable and start the unit. Keep
that address current if Tailscale assigns a new one.
The Ubuntu/WSL host and its distribution must remain running; systemd cannot
recover a powered-off laptop or stopped WSL instance.

## Verification status

The controlled API tests use fake Caddy, tunnel and upstream adapters and cover
authentication, validation, readiness, route replacement, removal, tunnel
restart, reconciliation and stale-route clearing. This environment has not
completed real Caddy or Quick Tunnel verification: `caddy` and `cloudflared`
are not installed in Ubuntu/WSL, and installing system packages requires
interactive sudo access. Before the demo, install both tools, run a local HTTP
app through Caddy, then verify a second laptop with
`curl http://<worker-tailscale-ip>:<assigned-port>/` and confirm the assigned
port is bound to Tailscale/private interfaces rather than a public interface.
