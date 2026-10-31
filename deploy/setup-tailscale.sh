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
      echo "==> Installing Tailscale using official installer..."
      if command -v curl >/dev/null 2>&1; then
        curl -fsSL https://tailscale.com/install.sh | sh
      elif command -v wget >/dev/null 2>&1; then
        wget -qO- https://tailscale.com/install.sh | sh
      else
        echo "Error: curl or wget is required to install Tailscale." >&2
        exit 1
      fi
    fi

    echo "==> Starting Tailscale..."
    if [ "$(id -u)" -eq 0 ]; then
      tailscale up
    elif command -v sudo >/dev/null 2>&1; then
      sudo tailscale up
    else
      tailscale up
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
