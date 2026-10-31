# Gateway service

The gateway runs on Laptop 4 in Ubuntu/WSL. Install Node.js, Caddy and
`cloudflared` using their official Ubuntu instructions. Keep Caddy's admin API
on `127.0.0.1:2019`; expose only the gateway service on the Tailscale
interface and protect it with `GATEWAY_TOKEN`.

Start the service for a local test with:

```bash
GATEWAY_TOKEN=replace-me node deploy/gateway/gateway.mjs
```

The control plane calls `POST /v1/routes/<deployment-id>` with an upstream
Tailscale IPv4 address, assigned host port, and optional `healthPath` (default
`/`). The response contains `status` and the current temporary Quick Tunnel
`publicUrl`. `DELETE /v1/routes/<deployment-id>` removes a stopped route.

On gateway restart, the control plane must call `POST /v1/reconcile` with its
authoritative current deployment records. The gateway does not restore a local
snapshot. If reconciliation fails, it clears in-memory routes and returns
`RECONCILIATION_UNAVAILABLE`, leaving stale routes unpublished. Successful
records are health-checked before routes and tunnels are restored.

For a systemd installation, copy `gateway.service.example` to
`/etc/systemd/system/cloud-without-clouds-gateway.service`, create the
environment file with a secret `GATEWAY_TOKEN`, then enable and start the unit.
The Ubuntu/WSL host and its distribution must remain running; systemd cannot
recover a powered-off laptop or stopped WSL instance.
