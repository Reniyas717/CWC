import * as React from 'react';
import { Copy, Check, Terminal, Shield, QrCode } from 'lucide-react';
import { BottomSheet } from '@/components/common/BottomSheet';
import { Button } from '@/components/common/Button';
import { generateQrSvg } from '@/lib/qr';
import { getStoredApiUrl } from '@/services/config';
import { haptics } from '@/lib/haptics';

export interface MobilePairWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobilePairWorkerModal({ isOpen, onClose }: MobilePairWorkerModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [osTab, setOsTab] = React.useState<'unix' | 'windows'>('unix');
  const apiUrl = getStoredApiUrl();

  const unixCommand = `curl -fsSL https://get.cwc.dev/worker.sh | CONTROL_PLANE_URL="${apiUrl}" bash`;
  const winCommand = `iwr -useb https://get.cwc.dev/worker.ps1 | iex -Environment @{ CONTROL_PLANE_URL = "${apiUrl}" }`;

  const activeCommand = osTab === 'unix' ? unixCommand : winCommand;
  const qrSvg = React.useMemo(() => generateQrSvg(activeCommand, 180), [activeCommand]);

  const handleCopy = async () => {
    haptics.medium();
    await navigator.clipboard.writeText(activeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Contribute a Laptop / Node"
      description="Connect your idle MacBook, ThinkPad, or Desktop to the distributed compute mesh."
    >
      <div className="space-y-4">
        {/* QR Code Presentation */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-secondary/30 border border-border/80">
          <div
            className="p-2 rounded-xl bg-card border border-border shadow-md"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-[11px] text-muted-foreground mt-2 text-center flex items-center space-x-1">
            <QrCode className="h-3 w-3 text-emerald-500" />
            <span>Scan with laptop camera or run command below</span>
          </p>
        </div>

        {/* OS Platform Selector */}
        <div className="flex rounded-xl bg-secondary p-1 border border-border">
          <button
            onClick={() => {
              haptics.light();
              setOsTab('unix');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              osTab === 'unix' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            macOS / Linux
          </button>
          <button
            onClick={() => {
              haptics.light();
              setOsTab('windows');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              osTab === 'windows' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Windows (PowerShell)
          </button>
        </div>

        {/* Terminal Command Box */}
        <div className="rounded-xl bg-black/90 border border-border p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span className="flex items-center space-x-1">
              <Terminal className="h-3 w-3 text-emerald-500" />
              <span>Host Terminal Command</span>
            </span>
            <span>Auth: Automatic</span>
          </div>

          <div className="font-mono text-xs text-emerald-400 break-all leading-relaxed select-all">
            {activeCommand}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="w-full h-8 text-xs space-x-1.5 mt-1 border-border/80 bg-secondary/40 text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Command Copied to Clipboard!' : 'Copy Pairing Command'}</span>
          </Button>
        </div>

        {/* Safety & Sandboxing Note */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-2.5">
          <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-foreground/90">
            <span className="font-semibold block text-emerald-500">Kernel Resource Boundaries</span>
            Containers launched on your machine are strictly capped with cgroups v2 limits (RAM, CPU, and PID limits). Your host OS, private files, and battery cannot be compromised.
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
