#!/usr/bin/env bash
set -euo pipefail

. /etc/os-release
echo "Ubuntu release: $VERSION_CODENAME"

sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/$VERSION_CODENAME.noarmor.gpg" \
  | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/$VERSION_CODENAME.tailscale-keyring.list" \
  | sudo tee /etc/apt/sources.list.d/tailscale.list

sudo apt-get update
sudo apt-get install tailscale
sudo tailscale up
