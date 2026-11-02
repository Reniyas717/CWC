import * as React from 'react';
import { Server, Key, Smartphone, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import {
  getStoredApiUrl,
  setStoredApiUrl,
  getStoredAdminToken,
  setStoredAdminToken,
  DEFAULT_SERVER_PRESETS,
} from '@/services/config';
import { mobileApi } from '@/services/api';
import { haptics } from '@/lib/haptics';

export interface MobileSettingsPageProps {
  onSignOut?: () => void;
}

export function MobileSettingsPage({ onSignOut }: MobileSettingsPageProps) {
  const [apiUrl, setApiUrl] = React.useState(getStoredApiUrl());
  const [adminToken, setAdminToken] = React.useState(getStoredAdminToken());
  const [saved, setSaved] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ online: boolean; latencyMs: number } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    haptics.medium();
    setStoredApiUrl(apiUrl);
    setStoredAdminToken(adminToken);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestConnection = async () => {
    haptics.light();
    setTesting(true);
    const res = await mobileApi.checkHealth();
    setTestResult(res);
    setTesting(false);
  };

  return (
    <div className="space-y-4 pb-20 px-3.5 pt-3 max-w-md mx-auto">
      {/* Page Header */}
      <div>
        <h2 className="font-heading font-bold text-base text-foreground">Mobile Settings</h2>
        <p className="text-xs text-muted-foreground">Manage control plane connection and device credentials</p>
      </div>

      {/* Control Plane Server Config */}
      <Card className="border-border/80 bg-card">
        <div className="p-3 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="h-4 w-4 text-emerald-500" />
            <h3 className="font-heading font-bold text-xs text-foreground">Control Plane Endpoint</h3>
          </div>
          <Badge variant="outline" className="text-[9px] font-mono">
            REST API
          </Badge>
        </div>

        <CardContent className="p-3.5 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Active Server URL</label>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="font-mono text-xs"
              placeholder="http://100.x.y.z:4000"
            />
            <p className="text-[10px] text-muted-foreground">
              Tip: Use your control-plane Tailscale IP (e.g. 100.124.251.107:4000) when running on your mobile phone.
            </p>
          </div>

          <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pt-1">
            {DEFAULT_SERVER_PRESETS.filter((p) => p.url).map((preset) => (
              <button
                key={preset.url}
                type="button"
                onClick={() => {
                  haptics.light();
                  setApiUrl(preset.url);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-medium whitespace-nowrap transition-all ${
                  apiUrl === preset.url
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500 font-bold'
                    : 'border-border bg-secondary/50 text-muted-foreground'
                }`}
              >
                {preset.label.split(' ')[0]}
              </button>
            ))}
          </div>

          <div className="flex space-x-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex-1 text-xs"
            >
              {testing ? 'Pinging...' : 'Test Connection'}
            </Button>

            <Button
              type="button"
              variant="emerald"
              size="sm"
              onClick={handleSave}
              className="flex-1 text-xs"
            >
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                testResult.online
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              }`}
            >
              <span>{testResult.online ? 'Control Plane Online' : 'Cannot Reach Server'}</span>
              <span className="font-mono font-bold">{testResult.latencyMs}ms</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin Token Card */}
      <Card className="border-border/80 bg-card">
        <div className="p-3 border-b border-border/50 flex items-center space-x-2">
          <Key className="h-4 w-4 text-emerald-500" />
          <h3 className="font-heading font-bold text-xs text-foreground">Admin Secret Token</h3>
        </div>

        <CardContent className="p-3.5 space-y-2">
          <Input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Enables mutating actions (creating apps, canceling workloads, triggering rebalances).
          </p>
        </CardContent>
      </Card>

      {/* Mobile PWA & Native App Guide */}
      <Card className="border-border/80 bg-card">
        <div className="p-3 border-b border-border/50 flex items-center space-x-2">
          <Smartphone className="h-4 w-4 text-emerald-500" />
          <h3 className="font-heading font-bold text-xs text-foreground">Mobile App Capabilities</h3>
        </div>

        <CardContent className="p-3.5 space-y-2 text-xs text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Home Screen PWA:</strong> Tap the Share button in Safari on iOS or Chrome on Android and select <span className="text-emerald-500 font-medium">"Add to Home Screen"</span> to run as a full-screen native mobile application.
          </p>
          <p>
            <strong className="text-foreground">Capacitor Native:</strong> Configured in <code className="text-foreground font-mono">capacitor.config.ts</code> for instant Xcode and Android Studio compilation.
          </p>
        </CardContent>
      </Card>

      {/* Sign Out Action */}
      {onSignOut && (
        <Button
          variant="destructive"
          size="lg"
          onClick={() => {
            haptics.heavy();
            onSignOut();
          }}
          className="w-full space-x-2"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out of Mobile Controller</span>
        </Button>
      )}
    </div>
  );
}
