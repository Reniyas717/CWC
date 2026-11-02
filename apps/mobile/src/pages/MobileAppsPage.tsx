import * as React from 'react';
import { Plus, Search, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { MobileDeploymentCard } from '@/components/deploy/MobileDeploymentCard';
import { MobileDeploySheet } from '@/components/deploy/MobileDeploySheet';
import { MobileLogsViewer } from '@/components/deploy/MobileLogsViewer';
import { MobileEqualizerSheet } from '@/components/workers/MobileEqualizerSheet';
import { mobileApi } from '@/services/api';
import { haptics } from '@/lib/haptics';

export function MobileAppsPage() {
  const [search, setSearch] = React.useState('');
  const [filterState, setFilterState] = React.useState<string>('all');
  const [deploySheetOpen, setDeploySheetOpen] = React.useState(false);
  const [activeLogDepId, setActiveLogDepId] = React.useState<string | null>(null);
  const [relocateDepId, setRelocateDepId] = React.useState<string | null>(null);

  const { data: apps = [], refetch: refetchApps } = useQuery({
    queryKey: ['apps'],
    queryFn: () => mobileApi.getApplications(),
    refetchInterval: 5000,
  });

  const { data: deployments = [], refetch: refetchDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => mobileApi.getDeployments(),
    refetchInterval: 4000,
  });

  const { data: workers = [], refetch: refetchWorkers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => mobileApi.getWorkers(),
  });

  const handleRefresh = () => {
    refetchApps();
    refetchDeployments();
    refetchWorkers();
  };

  const handleCancelDeployment = async (depId: string) => {
    haptics.heavy();
    await mobileApi.cancelDeployment(depId);
    handleRefresh();
  };

  const handleRedeploy = async (appId: string) => {
    haptics.medium();
    await mobileApi.triggerRedeploy(appId);
    handleRefresh();
  };

  // Filter deployments
  const filteredDeployments = deployments.filter((d) => {
    const matchedApp = apps.find((a) => a.id === d.applicationId);
    const nameMatch =
      (matchedApp?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      d.id.toLowerCase().includes(search.toLowerCase());
    const stateMatch = filterState === 'all' ? true : d.state === filterState;
    return nameMatch && stateMatch;
  });

  return (
    <div className="space-y-4 pb-20 px-3.5 pt-3 max-w-md mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-base text-foreground">Workloads & Apps</h2>
          <p className="text-xs text-muted-foreground">
            {deployments.length} total deployments running on laptop mesh
          </p>
        </div>

        <Button
          variant="emerald"
          size="sm"
          onClick={() => {
            haptics.medium();
            setDeploySheetOpen(true);
          }}
          className="space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Deploy</span>
        </Button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by app name or deployment ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs h-9"
        />
      </div>

      {/* State Filter Chips */}
      <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'all', label: 'All' },
          { id: 'running', label: 'Running' },
          { id: 'building', label: 'Building' },
          { id: 'queued', label: 'Queued' },
          { id: 'failed', label: 'Failed' },
        ].map((tab) => {
          const isSelected = filterState === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                haptics.light();
                setFilterState(tab.id);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-secondary text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Deployments List */}
      <div className="space-y-3">
        {filteredDeployments.length === 0 ? (
          <div className="p-8 rounded-2xl bg-secondary/30 border border-dashed border-border text-center space-y-2">
            <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto" />
            <p className="text-xs text-muted-foreground">No workloads match the selected filter.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterState('all');
                setSearch('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          filteredDeployments.map((dep) => {
            const matchedApp = apps.find((a) => a.id === dep.applicationId);
            const matchedWorker = workers.find((w) => w.id === dep.workerId);

            return (
              <MobileDeploymentCard
                key={dep.id}
                deployment={dep}
                app={matchedApp}
                worker={matchedWorker}
                onViewLogs={(id) => {
                  haptics.light();
                  setActiveLogDepId(id);
                }}
                onRelocate={(id) => {
                  haptics.light();
                  setRelocateDepId(id);
                }}
                onRedeploy={handleRedeploy}
                onCancel={handleCancelDeployment}
              />
            );
          })
        )}
      </div>

      {/* Modals & Sheets */}
      <MobileDeploySheet
        isOpen={deploySheetOpen}
        onClose={() => setDeploySheetOpen(false)}
        onSuccess={handleRefresh}
      />

      <MobileLogsViewer
        deploymentId={activeLogDepId}
        onClose={() => setActiveLogDepId(null)}
      />

      <MobileEqualizerSheet
        isOpen={!!relocateDepId}
        onClose={() => setRelocateDepId(null)}
        workers={workers}
        deployments={deployments}
        selectedDeploymentId={relocateDepId}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
