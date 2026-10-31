import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, GitBranch, Server, Cpu, HardDrive } from 'lucide-react';
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

const FRAMEWORKS: { value: AppFramework; label: string; defaultPort: number }[] = [
  { value: 'dockerfile', label: 'Dockerfile (Standard)', defaultPort: 3000 },
  { value: 'nodejs', label: 'Node.js (Express/Fastify)', defaultPort: 3000 },
  { value: 'python', label: 'Python (FastAPI/Flask)', defaultPort: 8000 },
  { value: 'static', label: 'Static Web (Vite/HTML/SPA)', defaultPort: 80 },
  { value: 'go', label: 'Go Web Service', defaultPort: 8080 },
];

export function NewApplicationModal({ isOpen, onClose }: NewApplicationModalProps) {
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [framework, setFramework] = React.useState<AppFramework>('dockerfile');
  const [repoUrl, setRepoUrl] = React.useState('');
  const [branch, setBranch] = React.useState('main');
  const [port, setPort] = React.useState(3000);
  const [replicas, setReplicas] = React.useState(1);
  const [cpuLimitCores, setCpuLimitCores] = React.useState(1.0);
  const [memoryLimitMb, setMemoryLimitMb] = React.useState(512);
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
    if (presetType === 'express') {
      setName('Express Microservice');
      setSlug('express-microservice');
      setFramework('nodejs');
      setRepoUrl('https://github.com/cloud-without-clouds/demo-node-app.git');
      setBranch('main');
      setPort(3000);
      setReplicas(2);
      setCpuLimitCores(1.0);
      setMemoryLimitMb(512);
      setEnvVars([
        { key: 'NODE_ENV', value: 'production', isSecret: false },
        { key: 'PORT', value: '3000', isSecret: false },
      ]);
    } else if (presetType === 'static') {
      setName('Vite Documentation Site');
      setSlug('vite-docs-site');
      setFramework('static');
      setRepoUrl('https://github.com/cloud-without-clouds/demo-static-web.git');
      setBranch('main');
      setPort(80);
      setReplicas(1);
      setCpuLimitCores(0.5);
      setMemoryLimitMb(256);
      setEnvVars([{ key: 'APP_ENV', value: 'production', isSecret: false }]);
    } else {
      setName('FastAPI Inference Service');
      setSlug('fastapi-service');
      setFramework('python');
      setRepoUrl('https://github.com/cloud-without-clouds/demo-python-api.git');
      setBranch('main');
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
        rootDirectory: '/',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg my-8 flex flex-col max-h-[90vh] text-foreground">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Deploy New Application
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure Git repository source, target port, and distributed worker limits.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Demo Presets */}
        <div className="px-6 pt-3 pb-2.5 bg-secondary/40 border-b border-border flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-muted-foreground font-medium whitespace-nowrap text-[11px]">Quick Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset('express')}
            className="px-2.5 py-1 rounded-md bg-card border border-border hover:border-primary text-foreground font-medium transition-colors cursor-pointer text-xs"
          >
            Node.js Express API
          </button>
          <button
            type="button"
            onClick={() => applyPreset('static')}
            className="px-2.5 py-1 rounded-md bg-card border border-border hover:border-primary text-foreground font-medium transition-colors cursor-pointer text-xs"
          >
            Vite / Static Web
          </button>
          <button
            type="button"
            onClick={() => applyPreset('python')}
            className="px-2.5 py-1 rounded-md bg-card border border-border hover:border-primary text-foreground font-medium transition-colors cursor-pointer text-xs"
          >
            Python FastAPI
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-xs">
              {errorMsg}
            </div>
          )}

          {/* Section: Basic Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Application Name *
              </label>
              <Input
                placeholder="e.g. Express API Gateway"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Slug (URL Identifier) *
              </label>
              <Input
                placeholder="express-api-gateway"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Section: Runtime Framework */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              Runtime Framework
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {FRAMEWORKS.map((fw) => (
                <button
                  key={fw.value}
                  type="button"
                  onClick={() => handleFrameworkChange(fw.value)}
                  className={`px-3 py-2 text-left rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                    framework === fw.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="font-semibold">{fw.label.split(' ')[0]}</div>
                  <div className="text-[10px] opacity-75 truncate">{fw.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Git Configuration */}
          <div className="p-3.5 bg-secondary/30 border border-border rounded-lg space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              Git Source Repository
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] text-muted-foreground">Repository URL *</label>
                <Input
                  placeholder="https://github.com/organization/repo.git"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Branch</label>
                <Input
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Networking & Resource Allocation */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Target Port
              </label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Replicas
              </label>
              <Input
                type="number"
                min={1}
                max={5}
                value={replicas}
                onChange={(e) => setReplicas(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Cpu className="h-3 w-3 text-muted-foreground" />
                CPU Cores
              </label>
              <select
                value={cpuLimitCores}
                onChange={(e) => setCpuLimitCores(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value={0.5}>0.5 Core</option>
                <option value={1.0}>1.0 Core</option>
                <option value={2.0}>2.0 Cores</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <HardDrive className="h-3 w-3 text-muted-foreground" />
                Memory Cap
              </label>
              <select
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value={256}>256 MB</option>
                <option value={512}>512 MB</option>
                <option value={1024}>1024 MB (1GB)</option>
                <option value={2048}>2048 MB (2GB)</option>
              </select>
            </div>
          </div>

          {/* Section: Environment Variables */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Environment Variables
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEnvRow}
                className="h-6 text-xs flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Row
              </Button>
            </div>

            {envVars.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No environment variables defined.</p>
            ) : (
              <div className="space-y-2">
                {envVars.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="KEY (e.g. PORT)"
                      value={row.key}
                      onChange={(e) => updateEnvRow(idx, 'key', e.target.value)}
                      className="flex-1 font-mono uppercase text-xs"
                    />
                    <Input
                      placeholder="VALUE"
                      value={row.value}
                      onChange={(e) => updateEnvRow(idx, 'value', e.target.value)}
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvRow(idx)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Scheduling...' : 'Deploy Application'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
