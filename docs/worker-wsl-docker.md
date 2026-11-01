# Docker access for the WSL worker

Run the worker with Linux Node in the same Ubuntu/WSL distro as Tailscale. The worker must reach a Linux Docker engine before it can accept deployments. Installing Docker Desktop on Windows alone does not guarantee the Ubuntu distro has a usable Docker socket.

Give each participating laptop a unique `WORKER_ID`. The API now rejects attempts by a different active hostname to reuse an ID, and it checks that Tailscale heartbeat/task requests come from the address registered to that worker. If `WORKER_ID` is omitted, the agent derives one from the machine hostname.

Start Docker Desktop, then run from the repository root inside Ubuntu:

```bash
bash deploy/connect-docker-wsl.sh
docker info --format '{{.ServerVersion}}'
```

The script checks the Docker Desktop proxy mounted in WSL, gives the existing `docker` group access to it, and links it to `/var/run/docker.sock`. It uses `sudo` only for socket setup; run the worker as your normal Ubuntu user. Rerun the script after Docker Desktop or WSL restarts if the proxy permissions reset. If Docker Desktop already created a working socket, the script leaves that socket in place. Do not expose the Docker API on a TCP port.

The worker now reports a runtime error while the daemon is unavailable and recovers through its regular readiness checks once Docker returns. Check the Workers page for its state before submitting a deployment.

Docker Desktop runs the engine outside Ubuntu's network namespace, so it cannot publish a container port directly on Ubuntu's Tailscale address. The worker publishes the container on Docker's `127.0.0.1` interface and opens a small TCP proxy bound only to the Ubuntu Tailscale IPv4 address. It reports that proxy port to the control plane. The proxy closes when the worker removes the container; keep the worker process running while deployments are active. On a native Linux Docker engine, the worker binds the container directly to Tailscale.

The worker checks managed containers during heartbeats. If Docker removes or stops a running container, the worker closes its proxy and reports the deployment as failed. The control plane clears the public URL immediately and removes the gateway route. The failure remains in deployment history with its reason.

After a worker restart, the control plane also compares its heartbeat workload list with deployments previously marked running on that worker. A missing workload older than the startup grace period is marked failed and its public route is removed.
