import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Trash2,
  GitBranch,
  Server,
  Cpu,
  HardDrive,
  Rocket,
  Sparkles,
  Globe,
  Code,
  FileCode,
  Terminal,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { AppFramework, CreateAppInput } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NewApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EnvRow {
  key: string;
  value: string;
  isSecret: boolean;
}

interface FrameworkOption {
  value: AppFramework;
  label: string;
  defaultPort: number;
  icon: React.ComponentType<{ className?: string }>;
}

const FRAMEWORKS: FrameworkOption[] = [
  { value: 'dockerfile', label: 'Dockerfile', defaultPort: 3000, icon: FileCode },
  { value: 'nodejs', label: 'Node.js', defaultPort: 3000, icon: Server },
  { value: 'python', label: 'Python', defaultPort: 8000, icon: Code },
  { value: 'static', label: 'Static Web', defaultPort: 80, icon: Globe },
  { value: 'go', label: 'Go Service', defaultPort: 8080, icon: Terminal },
];

const CPU_OPTIONS = [0.5, 1.0, 2.0, 4.0];
const MEMORY_OPTIONS = [256, 512, 1024, 2048];

export function NewApplicationModal({ isOpen, onClose }: NewApplicationModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [framework, setFramework] = React.useState<AppFramework>('dockerfile');
  const [repoUrl, setRepoUrl] = React.useState('');
  const [branch, setBranch] = React.useState('main');
  const [rootDirectory, setRootDirectory] = React.useState('/');
  const [port, setPort] = React.useState(3000);
  const [replicas, setReplicas] = React.useState(1);
  const [cpuLimitCores, setCpuLimitCores] = React.useState(1.0);
  const [memoryLimitMb, setMemoryLimitMb] = React.useState(512);
  const [activeTemplate, setActiveTemplate] = React.useState<'custom' | 'express' | 'static' | 'python'>('custom');
  const [envVars, setEnvVars] = React.useState<EnvRow[]>([
    { key: 'NODE_ENV', value: 'production', isSecret: false },
  ]);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    const generated = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(generated);
  };

  const handleFrameworkChange = (newFw: AppFramework) => {
    setFramework(newFw);
    const matched = FRAMEWORKS.find((f) => f.value === newFw);
    if (matched) {
      setPort(matched.defaultPort);
    }
  };

  const addEnvRow = () => {
    setEnvVars((prev) => [...prev, { key: '', value: '', isSecret: false }]);
  };

  const removeEnvRow = (index: number) => {
    setEnvVars((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEnvRow = (index: number, field: keyof EnvRow, value: string | boolean) => {
    setEnvVars((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const applyPreset = (presetType: 'express' | 'static' | 'python') => {
    setActiveTemplate(presetType);
    if (presetType === 'express') {
      setName('Express Microservice');
      setSlug('express-microservice');
      setFramework('nodejs');
      setRepoUrl('https://github.com/cloud-without-clouds/demo-node-app.git');
      setBranch('main');
      setRootDirectory('/');
      setPort(3000);
      setReplicas(2);
      setCpuLimitCores(1.0);
      setMemoryLimitMb(512);
      setEnvVars([
        { key: 'NODE_ENV', value: 'production', isSecret: false },
        { key: 'PORT', value: '3000', isSecret: false },
      ]);
    } else if (presetType === 'static') {
      setName('Vite Documentation');
      setSlug('vite-docs-site');
      setFramework('static');
      setRepoUrl('https://github.com/cloud-without-clouds/demo-static-web.git');
      setBranch('main');
      setRootDirectory('/');
      setPort(80);
      setReplicas(1);
      setCpuLimitCores(0.5);
      setMemoryLimitMb(256);
      setEnvVars([{ key: 'APP_ENV', value: 'production', isSecret: false }]);
    } else {
      setName('FastAPI Inference API');
      setSlug('fastapi-service');
      setFramework('python');
      setRepoUrl('https://github.com/cloud-without-clouds/demo-python-api.git');
      setBranch('main');
      setRootDirectory('/');
      setPort(8000);
      setReplicas(1);
      setCpuLimitCores(1.0);
      setMemoryLimitMb(1024);
      setEnvVars([{ key: 'ENVIRONMENT', value: 'production', isSecret: false }]);
    }
  };

  const mutation = useMutation({
    mutationFn: (input: CreateAppInput) => api.createApplication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      onClose();
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || 'Failed to create application');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Application name is required.');
      return;
    }

    if (!slug.trim() || !/^[a-z0-9-]+$/.test(slug)) {
      setErrorMsg('Slug must only contain lowercase alphanumeric characters and hyphens.');
      return;
    }

    if (!repoUrl.trim()) {
      setErrorMsg('Public Git repository URL is required.');
      return;
    }

    const cleanedEnv = envVars
      .filter((row) => row.key.trim().length > 0)
      .map((row) => ({
        key: row.key.trim(),
        value: row.value.trim(),
        isSecret: row.isSecret,
      }));

    const input: CreateAppInput = {
      name: name.trim(),
      slug: slug.trim(),
      framework,
      git: {
        repositoryUrl: repoUrl.trim(),
        branch: branch.trim() || 'main',
        rootDirectory: rootDirectory.trim() || '/',
      },
      port: Number(port),
      replicas: Number(replicas),
      resourceLimits: {
        cpuLimitCores: Number(cpuLimitCores),
        memoryLimitMb: Number(memoryLimitMb),
      },
      env: cleanedEnv,
    };

    mutation.mutate(input);
  };

  if (!isOpen) return null;

  const totalCores = (replicas * cpuLimitCores).toFixed(1);
  const totalMemory =
    replicas * memoryLimitMb >= 1024
      ? `${((replicas * memoryLimitMb) / 1024).toFixed(1)} GB`
      : `${replicas * memoryLimitMb} MB`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-xs no-scrollbar overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Rocket className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <h2
                className="text-base font-bold text-foreground leading-tight"
                style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
              >
                Deploy Application
              </h2>
              <p className="text-xs text-muted-foreground">
                Distributed container placement across developer workstations.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Presets Strip (Horizontal) */}
        <div className="px-6 py-2.5 bg-secondary/30 border-b border-border flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-xs">
          <span className="text-muted-foreground font-medium text-[11px] flex items-center gap-1 shrink-0">
            <Sparkles className="h-3 w-3" />
            Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset('express')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTemplate === 'express'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-card border border-border text-foreground hover:border-foreground/30'
            }`}
          >
            <Server className="h-3 w-3" />
            Node.js Express
          </button>
          <button
            type="button"
            onClick={() => applyPreset('static')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTemplate === 'static'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-card border border-border text-foreground hover:border-foreground/30'
            }`}
          >
            <Globe className="h-3 w-3" />
            Vite SPA
          </button>
          <button
            type="button"
            onClick={() => applyPreset('python')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTemplate === 'python'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-card border border-border text-foreground hover:border-foreground/30'
            }`}
          >
            <Code className="h-3 w-3" />
            Python FastAPI
          </button>
        </div>

        {/* Form Body: Two-Column Horizontal Master/Detail (No visible scrollbar, but smoothly scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto no-scrollbar p-6">
            {errorMsg && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Repository Source & Framework (~58%) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Workload Identity */}
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        Application Name
                      </label>
                      <Input
                        placeholder="Express API Gateway"
                        value={name}
                        onChange={(e) => {
                          setActiveTemplate('custom');
                          handleNameChange(e.target.value);
                        }}
                        required
                        className="h-8.5 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">
                        URL Slug
                      </label>
                      <Input
                        placeholder="express-api-gateway"
                        value={slug}
                        onChange={(e) => {
                          setActiveTemplate('custom');
                          setSlug(e.target.value);
                        }}
                        required
                        className="h-8.5 text-xs font-mono bg-background"
                      />
                    </div>
                  </div>

                  {slug && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground px-2 py-1 rounded bg-secondary/40 border border-border">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate">
                        Route: <span className="text-foreground">https://{slug}.trycloudflare.com</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Git Source */}
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <GitBranch className="h-3 w-3 text-muted-foreground" />
                      Public Git Repository URL
                    </label>
                    <Input
                      placeholder="https://github.com/organization/repo.git"
                      value={repoUrl}
                      onChange={(e) => {
                        setActiveTemplate('custom');
                        setRepoUrl(e.target.value);
                      }}
                      required
                      className="h-8.5 text-xs font-mono bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Branch</label>
                      <Input
                        placeholder="main"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        className="h-8 text-xs font-mono bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Root Directory</label>
                      <Input
                        placeholder="/"
                        value={rootDirectory}
                        onChange={(e) => setRootDirectory(e.target.value)}
                        className="h-8 text-xs font-mono bg-background"
                      />
                    </div>
                  </div>
                </div>

                {/* Framework Selector (Compact horizontal pills) */}
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-foreground">Runtime Framework</label>
                    <span className="text-[11px] font-mono text-muted-foreground">Default port: {port}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {FRAMEWORKS.map((fw) => {
                      const Icon = fw.icon;
                      const isSelected = framework === fw.value;
                      return (
                        <button
                          key={fw.value}
                          type="button"
                          onClick={() => handleFrameworkChange(fw.value)}
                          className={`px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer flex items-center gap-2 border ${
                            isSelected
                              ? 'bg-secondary border-foreground/50 text-foreground font-semibold shadow-2xs'
                              : 'bg-background border-border text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{fw.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Environment Variables */}
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Environment Variables</label>
                    <button
                      type="button"
                      onClick={addEnvRow}
                      className="text-[11px] font-medium text-foreground hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Add Variable
                    </button>
                  </div>

                  {envVars.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">No environment variables set.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar pr-0.5">
                      {envVars.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <Input
                            placeholder="KEY"
                            value={row.key}
                            onChange={(e) => updateEnvRow(idx, 'key', e.target.value)}
                            className="flex-1 font-mono uppercase text-[11px] h-7.5 bg-background"
                          />
                          <Input
                            placeholder="VALUE"
                            value={row.value}
                            onChange={(e) => updateEnvRow(idx, 'value', e.target.value)}
                            className="flex-1 font-mono text-[11px] h-7.5 bg-background"
                          />
                          <button
                            type="button"
                            onClick={() => removeEnvRow(idx)}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Deployment Inspector / Hardware Allocation (~42%) */}
              <div className="lg:col-span-5 space-y-4 bg-secondary/20 p-4.5 rounded-xl border border-border">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-foreground" />
                    Machine & Peer Spec
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                    Least-Load Policy
                  </span>
                </div>

                {/* Port & Replicas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Target Port</label>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      required
                      className="h-8 text-xs font-mono bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Replicas</label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={replicas}
                      onChange={(e) => setReplicas(Number(e.target.value))}
                      required
                      className="h-8 text-xs font-mono bg-background"
                    />
                  </div>
                </div>

                {/* CPU Allocation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                      <Cpu className="h-3 w-3" />
                      CPU Allocation
                    </span>
                    <span className="font-mono text-foreground font-semibold text-xs">
                      {cpuLimitCores} Core{cpuLimitCores > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {CPU_OPTIONS.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setCpuLimitCores(val)}
                        className={`py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer border ${
                          cpuLimitCores === val
                            ? 'bg-foreground text-background border-foreground font-bold'
                            : 'bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        {val}C
                      </button>
                    ))}
                  </div>
                </div>

                {/* Memory Allocation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                      <HardDrive className="h-3 w-3" />
                      Memory Cap
                    </span>
                    <span className="font-mono text-foreground font-semibold text-xs">
                      {memoryLimitMb >= 1024 ? `${memoryLimitMb / 1024} GB` : `${memoryLimitMb} MB`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {MEMORY_OPTIONS.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMemoryLimitMb(val)}
                        className={`py-1 rounded text-xs font-mono font-medium transition-colors cursor-pointer border ${
                          memoryLimitMb === val
                            ? 'bg-foreground text-background border-foreground font-bold'
                            : 'bg-background text-muted-foreground border-border hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        {val >= 1024 ? `${val / 1024}G` : `${val}M`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cluster Footprint Preview Card */}
                <div className="space-y-2 pt-2 border-t border-border text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Total Reserved:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {totalCores} Cores • {totalMemory}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Isolation:</span>
                    <span className="font-mono text-foreground text-[10px]">--pids-limit=256</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Ingress:</span>
                    <span className="text-foreground text-[10px]">Cloudflare Quick Tunnel</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-secondary/50 border border-border text-[11px] text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>Assigned to lowest-load worker node across peer mesh.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Modal Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-card shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Peer mesh ready • Ephemeral port auto-bind</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose} className="h-8.5 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="h-8.5 text-xs font-semibold flex items-center gap-1.5"
              >
                {mutation.isPending ? (
                  <>
                    <span className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Rocket className="h-3.5 w-3.5" />
                    Deploy Workload
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
