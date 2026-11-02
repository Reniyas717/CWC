import * as React from 'react';
import { Rocket, GitBranch, Cpu, HardDrive } from 'lucide-react';
import { BottomSheet } from '@/components/common/BottomSheet';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { mobileApi } from '@/services/api';
import { haptics } from '@/lib/haptics';

export interface MobileDeploySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TEMPLATES = [
  {
    name: 'Node.js Express API',
    repo: 'https://github.com/expressjs/express',
    branch: 'master',
    port: 3000,
    framework: 'dockerfile',
  },
  {
    name: 'Fastify High-Throughput',
    repo: 'https://github.com/fastify/fastify',
    branch: 'main',
    port: 8080,
    framework: 'dockerfile',
  },
  {
    name: 'Python Flask Microservice',
    repo: 'https://github.com/pallets/flask',
    branch: 'main',
    port: 5000,
    framework: 'dockerfile',
  },
];

export function MobileDeploySheet({ isOpen, onClose, onSuccess }: MobileDeploySheetProps) {
  const [appName, setAppName] = React.useState('');
  const [repoUrl, setRepoUrl] = React.useState('');
  const [branch, setBranch] = React.useState('main');
  const [port, setPort] = React.useState('3000');
  const [memoryMb, setMemoryMb] = React.useState(512);
  const [cpuCores, setCpuCores] = React.useState(1.0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    haptics.light();
    setAppName(t.name);
    setRepoUrl(t.repo);
    setBranch(t.branch);
    setPort(String(t.port));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim() || !repoUrl.trim()) {
      setError('Please provide an application name and public Git repository URL.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      haptics.medium();

      const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      await mobileApi.createApplication({
        name: appName.trim(),
        slug: slug || 'app',
        framework: 'dockerfile',
        git: {
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || 'main',
        },
        port: parseInt(port, 10) || 3000,
        replicas: 1,
        resourceLimits: {
          memoryLimitMb: memoryMb,
          cpuLimitCores: cpuCores,
        },
      });

      haptics.success();
      setIsSubmitting(false);
      onSuccess?.();
      onClose();
      // Reset form
      setAppName('');
      setRepoUrl('');
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : 'Deployment failed');
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Deploy New Application"
      description="Deploy a Dockerfile repository onto distributed laptop worker nodes."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs">
            {error}
          </div>
        )}

        {/* Quick Sample Presets */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Starter Presets
          </label>
          <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pb-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => applyTemplate(t)}
                className="whitespace-nowrap px-2.5 py-1 rounded-lg border border-border bg-secondary/50 text-[10px] font-medium hover:border-emerald-500/50 hover:bg-emerald-500/10 active:scale-95 transition-all text-foreground"
              >
                + {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* App Name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Application Name</label>
          <Input
            placeholder="e.g. backend-api"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            required
          />
        </div>

        {/* Git Repository URL */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Public Git Repository URL</label>
          <Input
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
            className="font-mono text-xs"
          />
        </div>

        {/* Branch & Port Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground flex items-center space-x-1">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              <span>Git Branch</span>
            </label>
            <Input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Internal Port</label>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        {/* Hardware Resource Boundary Limits */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center space-x-1">
            <Cpu className="h-3 w-3" />
            <span>Worker Node Resource Caps</span>
          </label>

          {/* Memory limit chips */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center space-x-1">
                <HardDrive className="h-3 w-3" />
                <span>Memory Limit:</span>
              </span>
              <span className="font-mono font-bold text-emerald-500">{memoryMb} MB</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[256, 512, 1024, 2048].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setMemoryMb(mb);
                  }}
                  className={`py-1 rounded-lg text-xs font-mono font-medium border transition-all ${
                    memoryMb === mb
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500 font-bold'
                      : 'border-border bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  {mb}MB
                </button>
              ))}
            </div>
          </div>

          {/* CPU limit chips */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">CPU Core Cap:</span>
              <span className="font-mono font-bold text-emerald-500">{cpuCores} Core</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[0.5, 1.0, 2.0].map((cores) => (
                <button
                  key={cores}
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setCpuCores(cores);
                  }}
                  className={`py-1 rounded-lg text-xs font-mono font-medium border transition-all ${
                    cpuCores === cores
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-500 font-bold'
                      : 'border-border bg-secondary/30 text-muted-foreground'
                  }`}
                >
                  {cores} Core
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="emerald"
            size="lg"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center space-x-2"
          >
            <Rocket className={`h-4 w-4 ${isSubmitting ? 'animate-bounce' : ''}`} />
            <span>{isSubmitting ? 'Scheduling on Idle Laptop...' : 'Deploy to Cluster'}</span>
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
