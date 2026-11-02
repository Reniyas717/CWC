import * as React from 'react';
import { Cloud, Download, Server, Check } from 'lucide-react';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { BottomSheet } from '@/components/common/BottomSheet';
import { MobileDownloadModal } from '@/components/common/MobileDownloadModal';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { mobileApi } from '@/services/api';
import {
  getStoredApiUrl,
  setStoredApiUrl,
  DEFAULT_SERVER_PRESETS,
} from '@/services/config';
import { haptics } from '@/lib/haptics';

export interface MobileHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function MobileHeader({ onRefresh }: MobileHeaderProps) {
  const [online, setOnline] = React.useState<boolean>(true);
  const [serverModalOpen, setServerModalOpen] = React.useState<boolean>(false);
  const [downloadModalOpen, setDownloadModalOpen] = React.useState<boolean>(false);
  const [currentUrl, setCurrentUrl] = React.useState<string>(getStoredApiUrl());
  const [customInput, setCustomInput] = React.useState<string>('');

  const checkConnectivity = React.useCallback(async () => {
    const res = await mobileApi.checkHealth();
    setOnline(res.online);
  }, []);

  React.useEffect(() => {
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 12000);
    return () => clearInterval(interval);
  }, [checkConnectivity]);

  const handleSelectPreset = (url: string) => {
    haptics.medium();
    setStoredApiUrl(url);
    setCurrentUrl(url);
    setServerModalOpen(false);
    checkConnectivity();
    onRefresh?.();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    haptics.medium();
    setStoredApiUrl(customInput.trim());
    setCurrentUrl(customInput.trim());
    setCustomInput('');
    setServerModalOpen(false);
    checkConnectivity();
    onRefresh?.();
  };

  return (
    <>
      <header className="sticky top-0 z-30 h-13 border-b border-border/80 bg-background/95 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between">
        {/* Left Side: Exactly Identical Brand Identity to PC Version */}
        <div className="flex items-center gap-2">
          {/* Rounded box logo: white box with black cloud in dark mode */}
          <div className="h-7 w-7 rounded-md bg-foreground text-background flex items-center justify-center font-bold shadow-xs shrink-0">
            <Cloud className="h-4 w-4" />
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="font-semibold text-sm tracking-tight text-foreground whitespace-nowrap">
              Cloud Without Clouds
            </span>
            <span className="text-muted-foreground/40 hidden sm:inline">/</span>
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
              Overview
            </span>
          </div>
        </div>

        {/* Right Side: Network Status Badge, Download App Button, Theme Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Status Indicator (Identical to PC version) */}
          <button
            onClick={() => {
              haptics.light();
              setServerModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground bg-secondary/60 border border-border hover:bg-secondary/90 transition-colors"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            <span className="text-foreground font-medium">{online ? 'Network Online' : 'Mock Mode'}</span>
          </button>

          {/* Direct Download App Button */}
          <button
            onClick={() => {
              haptics.light();
              setDownloadModalOpen(true);
            }}
            className="h-8 px-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs font-semibold flex items-center gap-1 hover:bg-emerald-500/20 active:scale-95 transition-all"
            aria-label="Download Mobile App"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">App</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </header>

      {/* Control Plane Endpoint Selector Sheet */}
      <BottomSheet
        isOpen={serverModalOpen}
        onClose={() => setServerModalOpen(false)}
        title="Control Plane Endpoint"
        description="Select or configure the backend server your mobile device connects to."
      >
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Available Endpoints
          </div>

          {DEFAULT_SERVER_PRESETS.filter((p) => p.url).map((preset) => {
            const isSelected = currentUrl === preset.url;
            return (
              <button
                key={preset.url}
                onClick={() => handleSelectPreset(preset.url)}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                  isSelected
                    ? 'border-emerald-500/80 bg-emerald-500/10'
                    : 'border-border bg-secondary/40 hover:bg-secondary/70'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold flex items-center space-x-2">
                    <span>{preset.label}</span>
                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-mono">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                    {preset.url}
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 mt-1">
                    {preset.description}
                  </div>
                </div>
                {isSelected && <Check className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />}
              </button>
            );
          })}

          <form onSubmit={handleCustomSubmit} className="pt-2 space-y-2 border-t border-border/60">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Custom Tailscale / Cloudflare URL
            </div>
            <div className="flex space-x-2">
              <Input
                placeholder="http://100.x.y.z:4000 or https://..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                className="font-mono text-xs"
              />
              <Button type="submit" variant="emerald" size="sm">
                Apply
              </Button>
            </div>
          </form>
        </div>
      </BottomSheet>

      {/* Direct App Download & Expo Companion Modal */}
      <MobileDownloadModal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
      />
    </>
  );
}
