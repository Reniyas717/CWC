#!/usr/bin/env bash
set -euo pipefail

# Detect operating system
OS="$(uname -s 2>/dev/null || echo "Unknown")"

case "$OS" in
  Linux*)
    echo "==> Detected Linux / WSL environment"
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      echo "==> OS: ${NAME:-Linux} (${VERSION_CODENAME:-unknown})"
    fi

    # Check if tailscale is already installed
    if command -v tailscale >/dev/null 2>&1; then
      echo "==> Tailscale is already installed: $(tailscale version 2>/dev/null | head -n 1 || echo "installed")"
    else
      echo "==> Installing Tailscale via pkgs.tailscale.com repository..."
      CODENAME="${VERSION_CODENAME:-noble}"
      
      SUDO_CMD=""
      if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
        SUDO_CMD="sudo"
      fi

      $SUDO_CMD mkdir -p --mode=0755 /usr/share/keyrings
      curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.noarmor.gpg" \
        | $SUDO_CMD tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
      curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.tailscale-keyring.list" \
        | $SUDO_CMD tee /etc/apt/sources.list.d/tailscale.list

      $SUDO_CMD apt-get update
      $SUDO_CMD apt-get install -y tailscale
    fi

    # Ensure tailscaled service is running
    if command -v systemctl >/dev/null 2>&1; then
      if [ "$(id -u)" -eq 0 ]; then
        systemctl enable --now tailscaled 2>/dev/null || true
      elif command -v sudo >/dev/null 2>&1; then
        sudo systemctl enable --now tailscaled 2>/dev/null || true
      fi
    fi

    echo "==> Starting Tailscale..."
    if command -v tailscale >/dev/null 2>&1; then
      tailscale up --qr=false || sudo tailscale up --qr=false
    fi
    ;;

  MINGW*|MSYS*|CYGWIN*)
    echo "==> Detected Windows shell (Git Bash / MSYS)"
    if command -v tailscale >/dev/null 2>&1; then
      echo "==> Tailscale CLI found"
      tailscale up
    elif [ -f "/c/Program Files/Tailscale/tailscale.exe" ]; then
      echo "==> Tailscale found in Program Files"
      "/c/Program Files/Tailscale/tailscale.exe" up
    elif command -v winget.exe >/dev/null 2>&1; then
      echo "==> Installing Tailscale via winget..."
      winget.exe install Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
      echo "==> Tailscale installed. Please restart your terminal or launch Tailscale from the Start menu."
    else
      echo "==> Tailscale not found. Please install from https://tailscale.com/download/windows"
      exit 1
    fi
    ;;

  Darwin*)
    echo "==> Detected macOS"
    if command -v brew >/dev/null 2>&1; then
      brew install tailscale
      sudo tailscale up
    else
      curl -fsSL https://tailscale.com/install.sh | sh
      sudo tailscale up
    fi
    ;;

  *)
    echo "==> Unsupported OS: $OS"
    echo "    Please install Tailscale manually from https://tailscale.com/download"
    exit 1
    ;;
esac
