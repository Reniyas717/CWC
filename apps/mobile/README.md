# Cloud Without Clouds - Mobile Application (`@cloud-without-clouds/mobile`)

**Cloud Without Clouds Mobile** is the dedicated companion application and fleet controller for the Cloud Without Clouds distributed application hosting platform.

It is built from the ground up for mobile devices (iOS, Android, and tablets) to monitor distributed worker laptops, trigger instant Dockerfile application deployments, review real-time streaming container logs, manage cluster load equalization, and pair developer laptops via QR codes.

---

## 📱 Key Mobile Features & Architecture

### 1. Mobile-Native UI/UX & Design Alignment
- **Identical Theme & Styling:** Fully styled with Tailwind CSS v4, dark mode by default with light mode toggle, OKLCH emerald accents (`#10b981`), rounded card elevations, and custom font pairings:
  - Headings: `Space Grotesk` (`--font-heading`)
  - Body & UI: `Geist` (`--font-sans`)
  - Code & Logs: `Geist Mono` (`--font-mono`)
- **Safe Area Inset Awareness:** Full compatibility with iPhone dynamic islands/notches and Android gesture bars using `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- **Haptic Feedback:** Native tactile vibrations (`navigator.vibrate`) for tab switches, action triggers, workload stops, and modal dismissals.
- **Fixed Bottom Navigation Bar:** High-performance 5-tab navigation:
  1. `Home` - Cluster overview, 6-step distributed execution pipeline, quick stats, active workloads.
  2. `Apps` - Application registry, search filter, state chips, direct HTTPS URLs, live log viewer.
  3. `Fleet` - Worker laptop nodes, hardware telemetry meters (RAM/CPU), chaos dropout simulation.
  4. `FinOps` - Real-time cloud cost arbitrage vs AWS EC2, interactive fleet scaling simulator.
  5. `More` - Endpoint switcher (Localhost / Tailscale IP / Custom), admin token management, diagnostics.
- **Floating Action Button (FAB):** One-tap `+ Deploy` button accessible from any screen with bottom sheet drawer.

---

### 2. Mobile Innovations & Differentiators

- **Pair Laptop via QR Code:** Mobile app renders an in-app SVG QR code containing the worker node launch command. Laptop cameras can scan the code to instantly join the cluster mesh.
- **Native Web Share API:** Tap the Share icon on any running application to share its public HTTPS or Tailscale MagicDNS URL directly via WhatsApp, Slack, Telegram, Twitter, or clipboard.
- **Dynamic Server URL Selector:** Mobile phones accessing the dashboard across Tailscale need to point to `http://100.x.y.z:4000` rather than `localhost`. The mobile app includes a built-in endpoint switcher with local storage persistence and connectivity test pinging.
- **Monospace Mobile Terminal:** Touch-friendly container log viewer with level filter chips (INFO, WARN, ERROR), copy-to-clipboard, and auto-scroll bottom.
- **Chaos Failover Simulation:** Trigger node dropouts directly from your phone and observe autonomous failover recovering workloads onto another laptop.
- **Resilient Fallback Mode:** Automatic fallback with high-fidelity simulated cluster metrics if the device is offline or the control-plane is booting.

---

## 🚀 Running Locally & On Actual Mobile Devices

### 1. Run Local Dev Server
```bash
# Starts Vite dev server with host binding on port 5174
pnpm --filter @cloud-without-clouds/mobile dev
```
Open in browser: `http://localhost:5174` (or open browser devtools and toggle Mobile Device mode, e.g. iPhone 14 Pro / Pixel 7).

### 2. Access on Physical Phone via Tailscale or Wi-Fi
Ensure your phone is connected to the same Tailscale tailnet or local Wi-Fi:
```text
http://<YOUR_TAILSCALE_OR_LAN_IP>:5174
```
Tap the server icon in the top header and set the control plane URL to `http://<YOUR_TAILSCALE_IP>:4000`.

### 3. Install as Progressive Web App (PWA)
- **iOS (Safari):** Tap the Share icon (box with upward arrow) -> Select **"Add to Home Screen"**.
- **Android (Chrome):** Tap the three-dot menu -> Select **"Install App"** or **"Add to Home screen"**.

### 4. Build for Native Android / iOS via Capacitor
The repository includes `capacitor.config.ts` pre-configured:
```bash
# Compile web distribution assets
pnpm --filter @cloud-without-clouds/mobile build

# Optional: Add Android / iOS native project shells
npx cap add android
npx cap add ios
npx cap open android
```

---

## 🔒 Verification & Quality Standards

- **Type Checking:** Passed `pnpm --filter @cloud-without-clouds/mobile check-types` (Exit code: 0).
- **Workspace Build:** Passed `pnpm --filter @cloud-without-clouds/mobile build` (Exit code: 0).
- **Workspace Linting:** Passed `pnpm lint` with 0 warnings/errors.
- **Isolation Guarantee:** Zero files outside of `apps/mobile/` were touched, modified, or deleted.
