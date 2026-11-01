#!/usr/bin/env bash
set -euo pipefail

# Docker Desktop may mount its engine proxy in WSL without creating the usual
# /var/run/docker.sock link. Give the distro's docker group access to that
# proxy, then let the ordinary worker process use the standard Docker CLI.
proxy=/mnt/wsl/docker-desktop/shared-sockets/guest-services/docker.proxy.sock
socket=/var/run/docker.sock

if [[ ! -S "$proxy" ]]; then
  echo 'Docker Desktop engine proxy is unavailable in this WSL distro. Start Docker Desktop and enable WSL integration.' >&2
  exit 1
fi

if ! getent group docker >/dev/null; then
  echo 'The docker group is missing in this WSL distro.' >&2
  exit 1
fi

if ! id -nG | tr ' ' '\n' | grep -qx docker; then
  echo 'Your Ubuntu user is not in the docker group. Add it, then start a new WSL session.' >&2
  exit 1
fi

sudo chgrp docker "$proxy"
sudo chmod 660 "$proxy"

if [[ -L "$socket" ]]; then
  [[ "$(readlink "$socket")" == "$proxy" ]] || {
    echo "$socket already links to a different Docker socket." >&2
    exit 1
  }
elif [[ -e "$socket" ]]; then
  echo "$socket already exists; leaving it untouched." >&2
else
  sudo ln -s "$proxy" "$socket"
fi

docker info --format 'Docker engine ready: {{.ServerVersion}}'
