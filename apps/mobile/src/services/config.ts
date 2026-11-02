/**
 * Mobile API server configuration management.
 * Persists chosen control-plane URL to localStorage so users can switch
 * between Tailscale mesh IP, local Wi-Fi, or localhost from the mobile UI.
 */

const STORAGE_KEY_API_URL = 'cwc_mobile_api_url_v1';
const STORAGE_KEY_ADMIN_TOKEN = 'cwc_mobile_admin_token_v1';

// Default endpoint options
export const DEFAULT_SERVER_PRESETS = [
  {
    label: 'Localhost (Dev / Emulator)',
    url: 'http://localhost:4000',
    description: 'Use when running inside an emulator or dev browser',
  },
  {
    label: 'Tailscale Mesh Node',
    url: 'http://100.124.251.107:4000',
    description: 'Direct encrypted mesh link to control plane',
  },
  {
    label: 'Custom Endpoint',
    url: '',
    description: 'Any Tailscale IP, Cloudflare Tunnel, or LAN host',
  },
];

export function getStoredApiUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_API_URL);
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore storage errors
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:4000';
}

export function setStoredApiUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_API_URL, url.trim().replace(/\/+$/, ''));
  } catch {
    // Ignore storage errors
  }
}

export function getStoredAdminToken(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ADMIN_TOKEN);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {
    // Ignore storage errors
  }
  return import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token-change-in-production';
}

export function setStoredAdminToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ADMIN_TOKEN, token.trim());
  } catch {
    // Ignore storage errors
  }
}
