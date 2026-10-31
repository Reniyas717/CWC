# Tailscale setup script for Windows
Write-Host "==> Checking Tailscale installation..." -ForegroundColor Cyan

$tailscaleCmd = Get-Command "tailscale" -ErrorAction SilentlyContinue
if (-not $tailscaleCmd) {
    if (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe") {
        $env:Path += ";$env:ProgramFiles\Tailscale"
        $tailscaleCmd = Get-Command "tailscale" -ErrorAction SilentlyContinue
    }
}

if (-not $tailscaleCmd) {
    Write-Host "==> Tailscale not found. Checking winget..." -ForegroundColor Yellow
    $wingetCmd = Get-Command "winget" -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Host "==> Installing Tailscale via winget..." -ForegroundColor Cyan
        winget install Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
        Write-Host "==> Tailscale installed. Launching Tailscale..." -ForegroundColor Green
        if (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe") {
            & "$env:ProgramFiles\Tailscale\tailscale.exe" up
        }
    } else {
        Write-Host "==> Please download and install Tailscale manually from: https://tailscale.com/download/windows" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "==> Tailscale is installed. Bringing up Tailscale..." -ForegroundColor Green
    tailscale up
}