import * as React from 'react';
import { ExternalLink, Share2, Terminal, ArrowRightLeft, RotateCw, AlertTriangle, Cpu, HardDrive } from 'lucide-react';
import { Deployment, AppConfig, WorkerNode } from '@cloud-without-clouds/shared';
import { Card, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { formatTimeAgo } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

export interface MobileDeploymentCardProps {
  deployment: Deployment;
  app?: AppConfig;
  worker?: WorkerNode;
  onViewLogs: (deploymentId: string) => void;
  onRelocate?: (deploymentId: string) => void;
  onRedeploy?: (appId: string) => void;
  onCancel?: (deploymentId: string) => void;
}

export function MobileDeploymentCard({
  deployment,
  app,
  worker,
  onViewLogs,
  onRelocate,
  onRedeploy,
  onCancel,
}: MobileDeploymentCardProps) {
  const [copied, setCopied] = React.useState(false);

  const getStatusBadge = (state: string) => {
    switch (state) {
      case 'running':
        return <Badge variant="success">● Running</Badge>;
      case 'building':
        return <Badge variant="purple">⚙ Building</Badge>;
      case 'queued':
        return <Badge variant="warning">⏳ Queued</Badge>;
      case 'failed':
        return <Badge variant="destructive">✕ Failed</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const handleShare = async () => {
    haptics.medium();
    const url = deployment.publicUrl || `http://${worker?.ipAddress || 'localhost'}:${deployment.assignedPort}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: app?.name || 'CWC Deployed Application',
          text: `Check out my application running on a distributed laptop cluster:`,
          url,
        });
      } catch {
        // User cancelled share
      }
    } else {
      // Fallback copy to clipboard
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const directUrl = deployment.publicUrl || (worker?.ipAddress && deployment.assignedPort ? `http://${worker.ipAddress}:${deployment.assignedPort}` : undefined);

  return (
    <Card className="border-border/80 bg-card overflow-hidden transition-all active:border-emerald-500/40">
      <CardContent className="p-3.5 space-y-3">
        {/* Top Header: App Name & Status */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-1.5">
              <h4 className="font-heading font-bold text-sm text-foreground">
                {app?.name || deployment.applicationId}
              </h4>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
              {deployment.id} • {formatTimeAgo(deployment.updatedAt || deployment.createdAt)}
            </span>
          </div>
          <div>{getStatusBadge(deployment.state)}</div>
        </div>

        {/* Assigned Worker Node Pill */}
        <div className="p-2 rounded-xl bg-secondary/40 border border-border/60 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-foreground text-[11px] line-clamp-1">
              {worker?.name || deployment.workerId || 'Pending Placement'}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center space-x-0.5">
              <HardDrive className="h-3 w-3" />
              <span>{deployment.resourceLimits?.memoryLimitMb || 512}M</span>
            </span>
            <span className="flex items-center space-x-0.5">
              <Cpu className="h-3 w-3" />
              <span>{deployment.resourceLimits?.cpuLimitCores || 1.0}C</span>
            </span>
          </div>
        </div>

        {/* Live URL Link with Share Sheet Trigger */}
        {directUrl && (
          <div className="flex items-center space-x-1.5">
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => haptics.light()}
              className="flex-1 flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 active:scale-[0.98] transition-all"
            >
              <span className="text-xs font-mono font-medium truncate mr-1">
                {directUrl}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>

            <button
              onClick={handleShare}
              className="p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 active:scale-95 transition-all"
              aria-label="Share URL"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {copied && (
          <div className="text-[10px] text-emerald-500 text-center font-medium">
            URL copied to clipboard!
          </div>
        )}

        {/* Action Button Row */}
        <div className="flex items-center space-x-1.5 pt-1 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewLogs(deployment.id)}
            className="flex-1 flex items-center justify-center space-x-1 text-[11px]"
          >
            <Terminal className="h-3 w-3 text-muted-foreground" />
            <span>Logs</span>
          </Button>

          {onRelocate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRelocate(deployment.id)}
              className="flex-1 flex items-center justify-center space-x-1 text-[11px]"
            >
              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
              <span>Relocate</span>
            </Button>
          )}

          {onRedeploy && app && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRedeploy(app.id)}
              className="flex items-center justify-center p-2 text-[11px]"
              aria-label="Redeploy"
            >
              <RotateCw className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}

          {onCancel && deployment.state === 'running' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(deployment.id)}
              className="flex items-center justify-center p-2 text-[11px]"
              aria-label="Stop Workload"
            >
              <AlertTriangle className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
