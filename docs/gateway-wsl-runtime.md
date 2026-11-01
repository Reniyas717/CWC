# Running the gateway in WSL

Run the gateway, Caddy, and cloudflared in the same Ubuntu/WSL distro as Tailscale. The gateway talks to Caddy through its loopback admin API and starts a cloudflared process for each deployment route.

Set these values in the project root `.env`:

```dotenv
GATEWAY_PORT=5050
GATEWAY_BIND_HOST=127.0.0.1
GATEWAY_URL=http://127.0.0.1:5050
```

Keep `GATEWAY_TOKEN` configured locally. The API must use the same token as the gateway. Restart the API after changing its gateway URL.

Start the gateway from the repository root:

```bash
bash deploy/start-gateway-wsl.sh
```

The launcher checks for Linux Node, cloudflared, the root `.env`, and Caddy's admin API. Install the repository dependencies before running it.

The API publishes routes after deployments report a running container and a reachable worker address. An idle gateway can have no Caddy application listeners and no cloudflared processes. Let the gateway create deployment tunnels; a manually started tunnel aimed at a removed listener cannot serve an application.

For Docker Desktop workers in WSL, set up Docker access with [Docker access for the WSL worker](worker-wsl-docker.md). The worker reports its private Tailscale proxy port to the gateway; Docker's loopback port stays local to the worker machine.

Creating a Quick Tunnel URL does not by itself verify public availability. Verify both the local Caddy listener and the generated HTTPS URL. Keep Caddy's admin API bound to loopback.
