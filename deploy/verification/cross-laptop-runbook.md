# Cross-laptop deployment verification

This runbook verifies the I1 acceptance path through the public interfaces. It
requires a gateway laptop and at least two worker laptops joined to the same
Tailscale tailnet. It is deliberately separate from the unit and controlled
gateway tests: those tests do not prove that a real worker can be reached from
the gateway or that a second worker can recover a deployment.

## Seams under test

| Seam | Observation | Does not prove |
| --- | --- | --- |
| Dashboard/API deployment submission | A repository submission creates a queued deployment and exposes its state/logs | That a worker can reach the repository or Docker Hub |
| Worker polling and result reporting | The assigned worker claims the task and reports `running` with a commit and host port | That the public route is reachable |
| Gateway route | The gateway returns a `publicUrl` and Caddy serves the app through the worker's Tailscale address | That the worker's port is safe unless the listener is inspected |
| Worker loss recovery | The old worker becomes offline, its route disappears, and a replacement worker receives a new attempt | Replica failover; this is redeployment and may have downtime |

## Preconditions

1. Start PostgreSQL, Redis, the API, and the dashboard using the repository's
   normal development commands. Run migrations first.
2. On the gateway laptop, start Caddy and the gateway service. Keep Caddy's
   admin endpoint on `127.0.0.1:2019`; only the gateway listener may use the
   gateway's Tailscale IPv4 address.
3. On each worker, start the worker agent with the same control-plane URL and
   worker secret. Confirm the worker reports a `100.64.0.0/10` Tailscale IPv4.
4. Use a public Git repository with a Dockerfile. The `landing-pages` test
   repository used by the team is suitable when its URL and branch are still
   available.

Check the mesh from the gateway before submitting a deployment:

```bash
tailscale status
tailscale ping <worker-1-tailscale-ip>
tailscale ping <worker-2-tailscale-ip>
```

## Deployment and HTTPS check

Submit the repository from the dashboard. In the API response or dashboard,
record the deployment ID and assigned worker. Wait until the deployment is
`running`, `routingStatus` is `ready`, and a temporary HTTPS `publicUrl` is
shown. Open that URL from a separate device and record an HTTP 200 response.

From the gateway's Ubuntu/WSL shell, verify the private hop using the assigned
worker address and host port from the deployment details:

```bash
curl --fail --max-time 5 http://<worker-tailscale-ip>:<assigned-port>/
```

On the worker, inspect the listener. The host port must be bound to its
Tailscale address, not `0.0.0.0`, `::`, or a public LAN address:

```bash
ss -ltn
docker ps --format '{{.ID}} {{.Ports}} {{.Names}}'
```

The public response must continue to work after several requests, and the
deployment logs should contain the build and container-start events. Record
the commit SHA, worker ID, assigned port, private curl result, public URL, and
HTTP status in the test report.

## Worker-loss recovery check

Use the worker that actually owns the deployment. Stop only that test worker
agent or disconnect that laptop from Tailscale; do not stop the gateway,
database, or another team's workload. Wait for the heartbeat lease timeout,
then trigger or wait for the API worker sweep.

Verify all of the following through the dashboard/API:

1. The original worker becomes `offline`.
2. The old route is removed or marked unavailable; the old worker address is
   not still advertised as the current upstream.
3. The deployment is queued/assigned to the eligible second worker, with a new
   attempt ID.
4. The second worker builds/starts the app and reports its own Tailscale IP and
   assigned port.
5. The gateway publishes the replacement route and the current `publicUrl`
   returns HTTP 200.
6. A result sent using the old worker/attempt is rejected as stale.

This demonstrates recovery by redeployment. It is not replica failover: with
one copy running, a brief outage while the replacement builds is expected.

## Current verification record

The controlled gateway test passed in this worktree:

```text
node --test deploy/gateway/gateway.test.mjs  # pass
```

The current machine could not complete the real I1 run. The Ubuntu/WSL
Tailscale status showed only the gateway laptop (`100.70.86.53`) and no second
worker. The API and gateway process were not reachable on their local test
ports during this check; Caddy was reachable but retained a stopped demo
upstream. Therefore no real cross-laptop HTTPS URL, private worker curl, or
worker-loss recovery result is claimed here. Re-run the steps above once a
second worker is online and the services are started.
