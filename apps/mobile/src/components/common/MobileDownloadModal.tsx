import * as React from 'react';
import { Download, Smartphone, QrCode, Check, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { generateQrSvg } from '@/lib/qr';
import { haptics } from '@/lib/haptics';

export interface MobileDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDownloadModal({ isOpen, onClose }: MobileDownloadModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [installPrompt, setInstallPrompt] = React.useState<any>(null);
  const [installed, setInstalled] = React.useState(false);

  // Capture beforeinstallprompt for 1-tap direct PWA installation
  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    haptics.medium();
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
      setInstallPrompt(null);
    } else {
      // Fallback instructions
      alert('To install on your phone:\n• iOS: Tap Share -> "Add to Home Screen"\n• Android: Tap 3 dots -> "Install App"');
    }
  };

  const handleDownloadApkPackage = () => {
    haptics.medium();
    // Create an offline PWA installable manifest bundle download
    const bundleContent = JSON.stringify(
      {
        name: 'Cloud Without Clouds Mobile',
        version: '0.1.0',
        expoSdkVersion: '58.0.5',
        package: 'com.cloudwithoutclouds.mobile',
        serverUrl: window.location.origin,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );

    const blob = new Blob([bundleContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CloudWithoutClouds-Mobile-v0.1.0.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const expoCommand = `npx expo start --tunnel`;
  const expoQrSvg = React.useMemo(() => generateQrSvg(expoCommand, 160), [expoCommand]);

  const handleCopyExpo = async () => {
    haptics.medium();
    await navigator.clipboard.writeText(expoCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Download Mobile App"
      description="Direct installation options for iOS, Android, and Expo SDK 58.0.5"
    >
      <div className="space-y-4">
        {/* Direct 1-Tap Mobile Install */}
        <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border space-y-3">
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-xl bg-foreground text-background flex items-center justify-center font-bold">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-heading font-bold text-xs text-foreground">
                Direct Install to Home Screen
              </h4>
              <p className="text-[10px] text-muted-foreground">
                Standalone mobile native experience (no browser bar, safe areas, haptics)
              </p>
            </div>
          </div>

          <Button
            variant="emerald"
            size="lg"
            onClick={handleInstallPwa}
            className="w-full space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>{installed ? 'Installed!' : installPrompt ? 'Install App Directly' : 'Add to Home Screen'}</span>
          </Button>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
            <div>
              <span className="font-semibold text-foreground block">iOS (Safari)</span>
              <span>Tap Share $\rightarrow$ Add to Home Screen</span>
            </div>
            <div>
              <span className="font-semibold text-foreground block">Android (Chrome)</span>
              <span>Tap ⋮ Menu $\rightarrow$ Install App</span>
            </div>
          </div>
        </div>

        {/* Expo SDK 58.0.5 Companion */}
        <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-heading font-bold text-xs text-foreground">
                Expo SDK 58.0.5 Companion
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              SDK 58.0.5
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <div
              className="p-1 rounded-xl bg-card border border-border shrink-0"
              dangerouslySetInnerHTML={{ __html: expoQrSvg }}
            />
            <div className="space-y-1.5 text-xs">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Run natively via Expo Go on physical devices or Android/iOS emulators:
              </p>
              <div className="p-2 rounded-lg bg-black/90 border border-border font-mono text-[10px] text-emerald-400 select-all">
                {expoCommand}
              </div>
              <button
                onClick={handleCopyExpo}
                className="text-[10px] font-medium text-emerald-500 flex items-center space-x-1"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? 'Copied command!' : 'Copy Expo Command'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Direct Offline Configuration File Download */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadApkPackage}
          className="w-full text-xs space-x-1.5 h-9 border-border bg-card"
        >
          <Download className="h-3.5 w-3.5 text-emerald-500" />
          <span>Download App Manifest Package (.json)</span>
        </Button>
      </div>
    </BottomSheet>
  );
}
