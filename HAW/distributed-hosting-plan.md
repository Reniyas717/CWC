# Loud Without Clouds: first working distributed deployment

## Recommendation

Use a Tailscale private mesh for laptop-to-laptop connectivity and Docker Swarm for placement, replicas, resource limits, and replacement of failed tasks. Keep one laptop as the Swarm manager and public gateway; register the other laptop(s) as workers. Publish the service through the Swarm ingress routing mesh and expose the manager's published port with Tailscale Funnel. This gives a public HTTPS URL without opening router ports or building a custom overlay in the first 24 hours.

The manager is intentionally a single control-plane and public-ingress failure point for this sprint. Worker failure is the availability scenario to demonstrate; multiple managers and Raft quorum are a later milestone.

## Network and request flow

```text
Browser --HTTPS--> Funnel URL (Tailscale)
                         |
                   manager :8080
                         |
              Docker Swarm ingress mesh
                 /                   \\
       app replica on manager   app replica on worker
```

Tailscale creates an encrypted, authenticated tailnet. Its default policy denies device-to-device connections until the policy allows them, so use tags/ACLs and never expose Docker's Engine API publicly. Funnel terminates public HTTPS and forwards to the manager's local port. Funnel requires the `funnel` node attribute and valid HTTPS certificates; the CLI can provision these. First-use DNS propagation may take up to ten minutes.

Swarm supplies the distributed behavior. `docker swarm init` creates a manager, internal state, a mutual-TLS Swarm CA, join tokens, and an ingress overlay. A worker joins with a one-time token. Published ports are accepted on every Swarm node and routed to an active task even when the receiving node has no task locally.

Sources: [Tailscale access control](https://tailscale.com/docs/features/access-control), [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel), [Docker Swarm mode](https://docs.docker.com/engine/swarm/swarm-mode/), [Swarm routing mesh](https://docs.docker.com/engine/swarm/ingress/).

## Exact first setup

Use Linux hosts where possible. Docker Desktop can run Linux containers, but first prove that each Docker daemon can advertise and reach the other laptop on its Tailscale IPv4 address. Keep Docker Engine versions aligned.

### 1. Connect the laptops

Install Docker Engine/Desktop and Tailscale on each laptop, put both devices in one tailnet, and record their Tailscale IPv4 addresses:

```powershell
tailscale ip -4
tailscale ping <other-tailnet-name-or-ip>
```

Use a short-lived, tagged Tailscale auth key for unattended registration and keep it outside Git. Tailscale documents a containerized client using `TS_AUTHKEY` and persistent state if a worker agent container is preferred later: [Tailscale Docker connection](https://tailscale.com/docs/features/containers/docker/how-to/connect-docker-standalone).

Allow these ports between the Tailscale addresses in the laptop firewalls:

| Port | Purpose |
|---|---|
| `2377/tcp` | Swarm control plane and worker join |
| `7946/tcp`, `7946/udp` | node/container network discovery |
| `4789/udp` | overlay and ingress data path |

These are Docker's documented multi-host overlay requirements: [overlay network driver](https://docs.docker.com/engine/network/drivers/overlay/). Verify the first port before debugging Docker:

```powershell
Test-NetConnection <manager-tailnet-ip> -Port 2377
```

### 2. Initialize and join Swarm

On the manager, bind Swarm traffic to its Tailscale address:

```bash
docker swarm init \
  --advertise-addr <manager-tailnet-ip> \
  --listen-addr <manager-tailnet-ip>:2377 \
  --data-path-addr <manager-tailnet-ip>
```

Copy the printed worker join command, keeping its token secret. On each worker, use the manager's Tailscale address if Docker printed a LAN address:

```bash
docker swarm join --token <worker-token> \
  --advertise-addr <worker-tailnet-ip> \
  <manager-tailnet-ip>:2377
```

On the manager:

```bash
docker node ls
```

Expect `Ready Active` for the manager and workers. If joining fails, run `tailscale ping` and check the three ports first. Swarm node traffic is mutually authenticated and encrypted by its CA; Tailscale provides the private transport path and device identity.

### 3. Run one replicated container service

Start with a public image to validate scheduling and networking; substitute the image built from Git after this works:

```bash
docker service create \
  --name demo-web \
  --replicas 2 \
  --publish published=8080,target=80 \
  --health-cmd 'CMD-SHELL,wget -q -O /dev/null http://127.0.0.1/ || exit 1' \
  --health-interval 10s \
  --health-timeout 3s \
  --health-retries 3 \
  --limit-cpu 0.50 --limit-memory 256M \
  --reserve-cpu 0.25 --reserve-memory 128M \
  nginx:alpine
```

Inspect placement:

```bash
docker service ls
docker service ps demo-web
docker service inspect --pretty demo-web
```

Swarm service definitions include image, replicas, published port, overlay network, CPU/memory limits and reservations, health check, and placement constraints. A task that crashes or fails its health check is replaced to restore the desired count. Sources: [Swarm services/tasks](https://docs.docker.com/engine/swarm/how-swarm-mode-works/services/), [service-create flags](https://docs.docker.com/reference/cli/docker/service/create/), [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/).

If replicas land on one laptop, label nodes and spread new tasks:

```bash
docker node update --label-add pool=worker-a <node-id-or-name>
docker node update --label-add pool=worker-b <node-id-or-name>
```

Use `--placement-pref 'spread=node.labels.pool'` when creating the service. Swarm does not automatically reshuffle existing tasks just because a new node joins; `docker service update --force demo-web` deliberately restarts tasks for a placement demo.

### 4. Publish HTTPS

On the manager:

```bash
tailscale funnel 8080
tailscale funnel status
```

Use the HTTPS URL printed by Funnel. Requests reach manager port 8080, then the Swarm ingress mesh sends them to an active replica. Funnel manages the HTTPS certificate and endpoint. A branded domain can later put Caddy in front of `localhost:8080`; Caddy supports active reverse-proxy health checks, but adding it is optional for the first proof. Sources: [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel), [Caddy reverse_proxy health checks](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

### 5. Simulate a worker failure

Keep manager/Funnel alive. Record placement, then pause the worker safely:

```bash
docker service ps demo-web
docker node update --availability drain <worker-name>
```

Or stop the worker's Docker/Tailscale process for an unplanned disconnect. Swarm marks the node unavailable and creates a replacement task on an active node. The manager's published port remains unchanged, so the same public URL continues while at least one replica and the manager remain available. Verify with repeated requests and a second `docker service ps demo-web` showing the replacement.

`drain` is the owner pause control: it prevents new tasks and moves existing service tasks to active nodes. A returning node is not automatically given old workloads; use an explicit update or scale operation to demonstrate rebalancing. Sources: [node availability](https://docs.docker.com/engine/swarm/manage-nodes/), [draining a node](https://docs.docker.com/engine/swarm/swarm-tutorial/drain-node/), [rebalancing](https://docs.docker.com/engine/swarm/admin_guide/).

## Git deployment path

Implement one path first:

1. Accept Git URL, branch/commit, service port, replicas, CPU/memory limits, and optional secrets.
2. Clone the commit in a disposable directory and build a Docker image. Require a `Dockerfile`; support HTTP apps and static sites packaged with nginx.
3. Push an immutable commit-tagged image to a registry reachable by every worker (GHCR/Docker Hub, or a TLS-protected registry on the manager). A manager-local image is not enough for worker placement.
4. Create/update the Swarm service with image tag, replicas, published target port, health check, limits, and secrets. Record commit SHA, image digest, task placement, and timestamps.
5. Stream `docker service ps`, `docker service logs --follow`, and health state into the dashboard. Redeploy with `docker service update --image <registry>/<app>:<commit> <service>`.

Do not expose the Docker socket or remote Engine API to browsers. The control plane talks to the manager through a local socket/pipe. Use Swarm secrets instead of credentials in Git, Dockerfiles, or ordinary environment variables; Docker encrypts secrets in transit and at rest and mounts them only into authorized service tasks: [Docker secrets](https://docs.docker.com/engine/swarm/secrets/).

## Judge-facing demonstration

1. Register laptops A and B; show Tailscale names, CPU/memory capacity, and `docker node ls`.
2. Deploy a Git-backed HTTP app with two replicas and a 256 MB/0.5 CPU limit; show commit, logs, health, and placement.
3. Open the public Funnel HTTPS URL.
4. Drain or disconnect B; refresh the same URL while its task is replaced on A.
5. Add laptop C, scale to three replicas, and use `docker service update --force` (or scale up/down) to demonstrate new capacity and placement.
6. Pause B from the owner dashboard, resume it, and record the event.

## 24-hour order

| Time | Deliverable |
|---|---|
| 0–2 h | Tailscale tailnet, two laptops, firewall checks |
| 2–4 h | Swarm init/join over Tailscale |
| 4–6 h | nginx service, published port, Funnel HTTPS URL |
| 6–8 h | replicas, health check, resource limits, failure demo |
| 8–12 h | Git clone/build/push and immutable tags |
| 12–16 h | API/dashboard for deploy, logs, workers, pause/resume |
| 16–20 h | SQLite/Postgres persistence and resource snapshots |
| 20–22 h | third worker, capacity/placement demo, recovery runbook |
| 22–24 h | rehearsal, failure injection, simplify flaky paths |

## Scope boundaries and risks

- A single manager is a control-plane and public-ingress single point of failure. Demonstrate worker failure explicitly; three managers are a later quorum milestone.
- Funnel may need an admin policy change and up to ten minutes of DNS propagation. Set it up early and keep a fallback Tailscale URL for rehearsal.
- Swarm overlay needs the three inter-node ports and working UDP 4789 over Tailscale. Test this before the dashboard.
- Keep the judged app stateless HTTP; stateful workloads need replicated persistent storage.
- Swarm does not automatically rebalance existing tasks onto a newly joined worker. Show growth with an explicit scale/update operation and state this in the UI.
