#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v node >/dev/null || [[ "$(node -p 'process.platform')" != linux ]]; then
  echo 'Start the gateway with Linux Node inside the WSL distro running Tailscale and Caddy.' >&2
  exit 1
fi

command -v cloudflared >/dev/null || { echo 'cloudflared is required inside WSL.' >&2; exit 1; }
[[ -f .env ]] || { echo 'Create the project root .env before starting the gateway.' >&2; exit 1; }
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:2019/config/ >/dev/null || {
  echo 'Caddy admin API must be reachable inside WSL at 127.0.0.1:2019.' >&2
  exit 1
}

exec node -r dotenv/config deploy/gateway/gateway.mjs
