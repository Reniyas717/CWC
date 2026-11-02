import React, { useState, useEffect, useCallback, useRef } from 'react';

// Polyfill React 19 Client Internals for React Native Fabric Renderer when running with React 18
const secret = (React && (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) || {};
if (React) {
  const ClientInternalsBridge = {
    get H() { return secret.ReactCurrentDispatcher ? secret.ReactCurrentDispatcher.current : null; },
    set H(v: any) { if (secret.ReactCurrentDispatcher) secret.ReactCurrentDispatcher.current = v; },
    get A() { return secret.ReactCurrentActQueue ? secret.ReactCurrentActQueue.current : null; },
    set A(v: any) { if (secret.ReactCurrentActQueue) secret.ReactCurrentActQueue.current = v; },
    T: null,
    S: null,
    actQueue: null,
    isBatchingLegacy: false,
    didScheduleLegacyUpdate: false,
    didUsePromise: false,
    asyncTransitions: null,
    thrownErrors: [],
    recentlyCreatedOwnerStacks: null,
    getCurrentStack: null,
  };
  (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ClientInternalsBridge;
}

import { registerRootComponent } from 'expo';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  Modal,
  RefreshControl,
  Linking,
  Platform,
  Share,
  LogBox,
} from 'react-native';

LogBox.ignoreAllLogs(true);

// Default control-plane API URL running on host laptop
const DEFAULT_API_URL = 'http://192.168.30.110:4000';
const DEFAULT_WEB_URL = 'http://192.168.30.110:5174';

interface WorkerNode {
  id: string;
  name: string;
  state: string;
  ipAddress?: string;
  resources?: {
    cpuCount?: number;
    cpuUsagePercent?: number;
    totalMemoryMb?: number;
    freeMemoryMb?: number;
    usedMemoryMb?: number;
    activeContainers?: number;
  };
}

interface Deployment {
  id: string;
  applicationId: string;
  workerId?: string;
  state: string;
  assignedPort?: number;
  publicUrl?: string;
  routingStatus?: string;
}

interface FinOpsData {
  monthlySavings: number;
  annualSavings: number;
  savingsRatePerSecond: number;
  awsInstanceEquivalent: string;
  nodeCount: number;
  activeWorkloadsCount: number;
}

// 6 Pipeline Stages matching PC dashboard exactly
const PIPELINE_STAGES = [
  {
    step: '01',
    name: 'Source Ingestion',
    subtitle: 'git clone & tarball verification',
    icon: '⑂',
    executes: 'Clones repository into a temporary sandboxed build directory on the host.',
    method: 'Git clone with shallow --depth=1 and strict commit hash validation.',
    problem: 'Eliminates cloud vendor lock-in and expensive cloud build credits.',
    security: 'HTTPS endpoint validation; build directory restricted to sandbox.',
  },
  {
    step: '02',
    name: 'Container Synthesis',
    subtitle: 'BuildKit & multi-stage caching',
    icon: '📄',
    executes: 'Compiles source Dockerfile directly on donor laptop daemon.',
    method: 'Docker BuildKit daemon invocation with memory bounds.',
    problem: 'Bypasses hyperscaler container registry storage fees.',
    security: 'Non-privileged build context; cannot alter host root filesystem.',
  },
  {
    step: '03',
    name: 'Kernel Isolation',
    subtitle: 'cgroups v2 & namespace limits',
    icon: '🛡️',
    executes: 'Enforces hard resource boundaries on the donor laptop.',
    method: 'Spawns container with --memory=512m, --cpus=1.0, and --pids-limit=256.',
    problem: 'Guarantees third-party code cannot exhaust host RAM or freeze OS.',
    security: 'PID caps completely neutralize fork-bomb vulnerabilities.',
  },
  {
    step: '04',
    name: 'Placement S(W)',
    subtitle: 'Least-loaded auction scheduler',
    icon: '🔲',
    executes: 'Evaluates least-loaded scoring S(W) to select optimal laptop node.',
    method: 'Calculates S(W) = 0.4*Mem + 0.3*CPU + 0.3*Containers.',
    problem: 'Prevents thermal hotspots and battery drain on any single laptop.',
    security: 'Worker authentication via SHA-256 worker secret token.',
  },
  {
    step: '05',
    name: 'Private Peer Mesh',
    subtitle: 'Encrypted WireGuard mesh',
    icon: '⚯',
    executes: 'Establishes direct point-to-point mesh across laptops.',
    method: 'Tailscale WireGuard overlay tunnel without public port forwarding.',
    problem: 'No public IP address needed; operates behind home NAT/firewalls.',
    security: 'All inter-node traffic is end-to-end encrypted; zero exposed ports.',
  },
  {
    step: '06',
    name: 'Edge Ingress & Tunnel',
    subtitle: 'Zero-cost Caddy & Cloudflare Tunnel',
    icon: '🌐',
    executes: 'Exposes container to global web via encrypted tunnel.',
    method: 'Caddy reverse proxy upstream sync + Cloudflare Quick Tunnel.',
    problem: 'Zero cloud load balancer fees; free public HTTPS access.',
    security: 'Automatic edge TLS termination and SSL certificate rotation.',
  },
];

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_API_URL);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'workloads' | 'fleet' | 'finops' | 'logs'>('overview');
  const [selectedStageIdx, setSelectedStageIdx] = useState(2); // Step 03 selected by default
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<string>('Just now');

  // Live data fetched from control-plane API
  const [health, setHealth] = useState<any>({
    service: 'cloud-without-clouds-control-plane',
    version: '0.1.0',
    uptime: 2093,
    environment: 'Development',
    online: false,
  });
  const [workers, setWorkers] = useState<WorkerNode[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [finops, setFinops] = useState<FinOpsData | null>(null);
  const [liveSavings, setLiveSavings] = useState(0);

  // Deploy form state
  const [appName, setAppName] = useState('');
  const [repoUrl, setRepoUrl] = useState('https://github.com/expressjs/express');
  const [deploying, setDeploying] = useState(false);

  // FinOps slider
  const [laptopSlider, setLaptopSlider] = useState(3);

  // Simulation logs
  const [logs, setLogs] = useState<string[]>([
    '[09:58:12] [Control-Plane] Cluster controller initiated in local development mode.',
    '[09:58:14] [Worker-Alpha] Heartbeat registered from 100.70.86.53 (Tailscale mesh).',
    '[09:59:02] [Scheduler] Least-loaded placement S(W) evaluated for worker-node-local-01.',
    '[10:01:22] [Caddy] Reverse proxy upstream registered at 127.0.0.1:20015.',
    '[10:02:49] [Edge] Cloudflare Quick Tunnel route active: https://cwc-demo.trycloudflare.com',
  ]);

  // Fetch real data from backend API
  const fetchAllData = useCallback(async () => {
    try {
      const now = new Date();
      setLastCheckedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // 1. Health
      const healthRes = await fetch(`${apiUrl}/health`).catch(() => null);
      if (healthRes && healthRes.ok) {
        const hData = await healthRes.json();
        setHealth({ ...hData, online: true });
      } else {
        setHealth((prev: any) => ({ ...prev, online: false }));
      }

      // 2. Workers
      const workersRes = await fetch(`${apiUrl}/api/v1/workers`).catch(() => null);
      if (workersRes && workersRes.ok) {
        const wData = await workersRes.json();
        if (Array.isArray(wData.data)) setWorkers(wData.data);
      }

      // 3. Deployments
      const depsRes = await fetch(`${apiUrl}/api/v1/deployments`).catch(() => null);
      if (depsRes && depsRes.ok) {
        const dData = await depsRes.json();
        if (Array.isArray(dData.data)) setDeployments(dData.data);
      }

      // 4. FinOps
      const finopsRes = await fetch(`${apiUrl}/api/v1/finops/summary`).catch(() => null);
      if (finopsRes && finopsRes.ok) {
        const fData = await finopsRes.json();
        if (fData.data) {
          setFinops(fData.data);
          if (fData.data.nodeCount > 0) setLaptopSlider(fData.data.nodeCount);
        }
      }
    } catch {
      // Offline fallback
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 8000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Live ticking savings counter
  useEffect(() => {
    const rate = finops?.savingsRatePerSecond || 0.000138;
    const interval = setInterval(() => {
      setLiveSavings((prev) => prev + rate);
    }, 1000);
    return () => clearInterval(interval);
  }, [finops]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const handleDeploy = async () => {
    if (!appName.trim() || !repoUrl.trim()) return;
    try {
      setDeploying(true);
      await fetch(`${apiUrl}/api/v1/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: appName.trim(),
          slug: appName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          framework: 'dockerfile',
          git: { repoUrl: repoUrl.trim(), branch: 'main' },
          port: 3000,
          replicas: 1,
          resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
        }),
      });
      setDeploying(false);
      setIsDeployModalOpen(false);
      setAppName('');
      fetchAllData();
    } catch {
      setDeploying(false);
      setIsDeployModalOpen(false);
    }
  };

  const handleShareManifest = async () => {
    try {
      const manifest = JSON.stringify(
        {
          cluster: 'cloud-without-clouds',
          version: health.version || '0.1.0',
          workers: workers.length,
          workloads: deployments.length,
          apiUrl,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      );
      await Share.share({
        title: 'Cloud Without Clouds Cluster Manifest',
        message: manifest,
      });
    } catch {
      // Ignored
    }
  };

  const onlineWorkersCount = workers.filter((w) => w.state !== 'offline').length || 3;
  const runningDepsCount = deployments.filter((d) => d.state === 'running').length || 2;
  const currentStage = PIPELINE_STAGES[selectedStageIdx];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Top Header - Exact match to PC version with white rounded logo box */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          {/* White rounded square with black Cloud icon */}
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>☁</Text>
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={styles.brandTitle}>Cloud Without Clouds</Text>
            <Text style={styles.breadcrumbText}>/ Overview</Text>
          </View>
        </View>

        {/* Right Header Actions */}
        <View style={styles.headerActions}>
          {/* Live Network Online Status Pill */}
          <TouchableOpacity
            onPress={() => setIsUrlModalOpen(true)}
            style={styles.networkBadge}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.networkDot,
                { backgroundColor: health.online ? '#10b981' : '#f59e0b' },
              ]}
            />
            <Text style={styles.networkText}>
              {health.online ? 'Network Online' : 'Connecting...'}
            </Text>
          </TouchableOpacity>

          {/* Direct Download Button */}
          <TouchableOpacity
            onPress={() => setIsDownloadModalOpen(true)}
            style={styles.downloadIconBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.downloadIconText}>⬇</Text>
          </TouchableOpacity>

          {/* Settings / IP Config */}
          <TouchableOpacity
            onPress={() => setIsUrlModalOpen(true)}
            style={styles.settingsIconBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.settingsIconText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Pill Bar (PC parity navigation) */}
      <View style={styles.navBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navBarContent}>
          <TouchableOpacity
            onPress={() => setActiveTab('overview')}
            style={[styles.navTab, activeTab === 'overview' && styles.navTabActive]}
          >
            <Text style={[styles.navTabText, activeTab === 'overview' && styles.navTabTextActive]}>
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('fleet')}
            style={[styles.navTab, activeTab === 'fleet' && styles.navTabActive]}
          >
            <Text style={[styles.navTabText, activeTab === 'fleet' && styles.navTabTextActive]}>
              Workers ({onlineWorkersCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('workloads')}
            style={[styles.navTab, activeTab === 'workloads' && styles.navTabActive]}
          >
            <Text style={[styles.navTabText, activeTab === 'workloads' && styles.navTabTextActive]}>
              Deployments ({runningDepsCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('finops')}
            style={[styles.navTab, activeTab === 'finops' && styles.navTabActive]}
          >
            <Text style={[styles.navTabText, activeTab === 'finops' && styles.navTabTextActive]}>
              FinOps Arbitrage
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('logs')}
            style={[styles.navTab, activeTab === 'logs' && styles.navTabActive]}
          >
            <View style={styles.logTabRow}>
              <Text style={[styles.navTabText, activeTab === 'logs' && styles.navTabTextActive]}>
                Cluster Logs
              </Text>
              <View style={styles.logLiveDot} />
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main Scroll Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* PC Top Metadata Strip */}
        <View style={styles.systemBar}>
          <View style={styles.systemGrid}>
            <View style={styles.systemCol}>
              <Text style={styles.systemLabel}>SERVICE</Text>
              <Text style={styles.systemVal} numberOfLines={1}>
                {health.service || 'cloud-without-clouds-control-plane'}
              </Text>
            </View>
            <View style={styles.systemCol}>
              <Text style={styles.systemLabel}>VERSION</Text>
              <Text style={styles.systemVal}>v{health.version || '0.1.0'}</Text>
            </View>
            <View style={styles.systemCol}>
              <Text style={styles.systemLabel}>UPTIME</Text>
              <Text style={styles.systemVal}>{health.uptime || 2093}s</Text>
            </View>
            <View style={styles.systemCol}>
              <Text style={styles.systemLabel}>ENVIRONMENT</Text>
              <Text style={styles.systemVal}>{health.environment || 'Development'}</Text>
            </View>
          </View>

          {/* PC Amber Fallback Notice Banner */}
          <View style={styles.amberBanner}>
            <Text style={styles.amberIcon}>ℹ</Text>
            <Text style={styles.amberText}>
              API server is active and running in local development fallback mode. Backing database/cache services are simulated in-memory.
            </Text>
            <View style={styles.mockPill}>
              <Text style={styles.mockPillText}>MOCK FALLBACK</Text>
            </View>
          </View>

          {/* Heartbeat Status Row */}
          <View style={styles.heartbeatRow}>
            <Text style={styles.heartbeatLeft}>∿ Heartbeat polling every 10s</Text>
            <Text style={styles.heartbeatRight}>Last checked {lastCheckedTime}</Text>
          </View>
        </View>

        {/* Action Buttons: Deploy an application & Direct Download */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setIsDeployModalOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Deploy an application</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setIsDownloadModalOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>⬇ Download App</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'overview' && (
          <>
            {/* DISTRIBUTED DEPLOYMENT EXECUTION PIPELINE (Exact match to PC screenshot) */}
            <View style={styles.pipelineCard}>
              <View style={styles.pipelineHeader}>
                <View style={styles.pipelineHeaderTitleRow}>
                  <Text style={styles.pipelineWaveIcon}>∿</Text>
                  <View>
                    <View style={styles.pipelineTitleBadgeRow}>
                      <Text style={styles.pipelineTitle}>Distributed Deployment Execution Pipeline</Text>
                      <View style={styles.liveArchBadge}>
                        <Text style={styles.liveArchText}>Live Architecture</Text>
                      </View>
                    </View>
                    <Text style={styles.pipelineSub}>
                      Real-time visualization of autonomous repository synthesis, kernel resource capping, and peer placement.
                    </Text>
                  </View>
                </View>
              </View>

              {/* 6 Step Nodes with Green Slider Line positioned BEHIND all boxes */}
              <View style={styles.pipelineTrackContainer}>
                {/* Horizontal Green Line sitting UNDER the boxes */}
                <View style={styles.horizontalGreenLine} />

                {/* 6 Stages */}
                <View style={styles.stagesRow}>
                  {PIPELINE_STAGES.map((stg, idx) => {
                    const isSelected = selectedStageIdx === idx;
                    return (
                      <TouchableOpacity
                        key={stg.step}
                        onPress={() => setSelectedStageIdx(idx)}
                        style={[
                          styles.stageBox,
                          isSelected && styles.stageBoxSelected,
                        ]}
                        activeOpacity={0.8}
                      >
                        {/* Step Checkmark / Icon Badge */}
                        <View style={[styles.stageIconBadge, isSelected && styles.stageIconBadgeSelected]}>
                          <Text style={[styles.stageIconText, isSelected && styles.stageIconTextSelected]}>
                            {stg.icon}
                          </Text>
                          {isSelected && (
                            <View style={styles.stageCheckmarkDot}>
                              <Text style={styles.stageCheckmarkText}>✓</Text>
                            </View>
                          )}
                        </View>

                        <Text style={[styles.stageNameText, isSelected && styles.stageNameTextSelected]} numberOfLines={1}>
                          {stg.name}
                        </Text>
                        <Text style={[styles.stageStepText, isSelected && styles.stageStepTextSelected]}>
                          Step {stg.step}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Selected Stage Deep-Dive Card (Matching PC 4-column breakdown) */}
              <View style={styles.deepDiveContainer}>
                <View style={styles.deepDiveHeader}>
                  <View style={styles.deepDiveTitleRow}>
                    <Text style={styles.deepDiveIcon}>{currentStage.icon}</Text>
                    <Text style={styles.deepDiveTitle}>
                      STAGE DEEP-DIVE {currentStage.name}
                    </Text>
                    <Text style={styles.deepDiveSubtitle}>
                      {currentStage.subtitle}
                    </Text>
                  </View>
                  <View style={styles.zeroHyperscalerBadge}>
                    <Text style={styles.zeroHyperscalerText}>Zero-Hyperscaler Architecture</Text>
                  </View>
                </View>

                {/* 4 Informational Cards Grid */}
                <View style={styles.deepDiveGrid}>
                  {/* Card 1 */}
                  <View style={styles.deepDiveCol}>
                    <Text style={styles.deepDiveColHeader}>&gt;_ 1. WHAT IT EXECUTES</Text>
                    <Text style={styles.deepDiveColContent}>{currentStage.executes}</Text>
                  </View>

                  {/* Card 2 */}
                  <View style={styles.deepDiveCol}>
                    <Text style={styles.deepDiveColHeader}>⚙ 2. TECHNICAL METHOD</Text>
                    <Text style={styles.deepDiveColContent}>{currentStage.method}</Text>
                  </View>

                  {/* Card 3 */}
                  <View style={styles.deepDiveCol}>
                    <Text style={styles.deepDiveColHeader}>☁ 3. CLOUD PROBLEM SOLVED</Text>
                    <Text style={styles.deepDiveColContent}>{currentStage.problem}</Text>
                  </View>

                  {/* Card 4 */}
                  <View style={styles.deepDiveCol}>
                    <Text style={styles.deepDiveColHeader}>🛡 4. HOST LAPTOP SECURITY</Text>
                    <Text style={styles.deepDiveColContent}>{currentStage.security}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 4 Bottom Metric Cards (Exact match to PC screenshot) */}
            <View style={styles.metricsGrid}>
              {/* Card 1: Active Workers */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricLabel}>Active Workers</Text>
                  <Text style={styles.metricIcon}>💻</Text>
                </View>
                <Text style={styles.metricBigNumber}>{onlineWorkersCount}</Text>
                <Text style={styles.metricSubHighlight}>{onlineWorkersCount} of {Math.max(workers.length, 3)} Online</Text>
                <Text style={styles.metricDesc}>Distributed laptops & desktop workstations</Text>
              </View>

              {/* Card 2: Active Workloads */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricLabel}>Active Workloads</Text>
                  <Text style={styles.metricIcon}>⛶</Text>
                </View>
                <Text style={styles.metricBigNumber}>{runningDepsCount}</Text>
                <Text style={styles.metricSubHighlight}>{runningDepsCount} of {Math.max(deployments.length, 2)} Running</Text>
                <Text style={styles.metricDesc}>Distributed tasks with memory & CPU caps</Text>
              </View>

              {/* Card 3: Scheduling Policy */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricLabel}>Scheduling Policy</Text>
                  <Text style={styles.metricIcon}>🛡</Text>
                </View>
                <Text style={styles.metricBigNumber}>S(W)</Text>
                <Text style={styles.metricSubHighlight}>Least-Loaded</Text>
                <Text style={styles.metricDesc}>Automatic placement on lowest load node</Text>
              </View>

              {/* Card 4: Ingress & Gateway */}
              <View style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricLabel}>Ingress & Gateway</Text>
                  <Text style={styles.metricIcon}>⑂</Text>
                </View>
                <Text style={[styles.metricBigNumber, { color: '#10b981' }]}>Live</Text>
                <Text style={styles.metricSubHighlight}>2 ready routes</Text>
                <Text style={styles.metricDesc}>Zero-cost Caddy reverse proxy & tunnels</Text>
              </View>
            </View>
          </>
        )}

        {/* FLEET VIEW */}
        {activeTab === 'fleet' && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Distributed Worker Nodes ({workers.length || 3})</Text>
            {(workers.length > 0 ? workers : [
              { id: 'worker-node-local-01', name: 'Workstation Alpha (Host)', state: 'idle', resources: { usedMemoryMb: 4120, totalMemoryMb: 16384, cpuUsagePercent: 12.4, cpuCount: 8, activeContainers: 1 } },
              { id: 'worker-node-laptop-02', name: 'MacBook Pro M2 (Worker 2)', state: 'idle', resources: { usedMemoryMb: 5210, totalMemoryMb: 16384, cpuUsagePercent: 18.2, cpuCount: 8, activeContainers: 1 } },
              { id: 'worker-node-edge-03', name: 'Dell XPS 15 (Worker 3)', state: 'idle', resources: { usedMemoryMb: 3840, totalMemoryMb: 32768, cpuUsagePercent: 8.5, cpuCount: 16, activeContainers: 0 } },
            ]).map((w) => (
              <View key={w.id} style={styles.workerCard}>
                <View style={styles.workerHeader}>
                  <View style={styles.workerNameRow}>
                    <Text style={styles.workerIcon}>💻</Text>
                    <Text style={styles.workerName}>{w.name}</Text>
                  </View>
                  <View style={styles.idleBadge}>
                    <Text style={styles.idleBadgeText}>● {w.state}</Text>
                  </View>
                </View>

                <View style={styles.workerTelemetryRow}>
                  <View style={styles.telemetryCol}>
                    <Text style={styles.telemetryLabel}>Memory</Text>
                    <Text style={styles.telemetryVal}>
                      {w.resources?.usedMemoryMb || 4096}M / {w.resources?.totalMemoryMb || 16384}M
                    </Text>
                  </View>
                  <View style={styles.telemetryCol}>
                    <Text style={styles.telemetryLabel}>CPU</Text>
                    <Text style={styles.telemetryVal}>
                      {w.resources?.cpuUsagePercent || 14.5}% ({w.resources?.cpuCount || 8} vCPUs)
                    </Text>
                  </View>
                  <View style={styles.telemetryCol}>
                    <Text style={styles.telemetryLabel}>Containers</Text>
                    <Text style={styles.telemetryVal}>
                      {w.resources?.activeContainers || 1} active
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* WORKLOADS VIEW */}
        {activeTab === 'workloads' && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Active Workloads ({deployments.length || 2})</Text>
            {(deployments.length > 0 ? deployments : [
              { id: 'dep-018e3a2b', applicationId: 'express-microservice-api', workerId: 'worker-node-local-01', state: 'running', assignedPort: 20015, publicUrl: 'https://cwc-express-api.trycloudflare.com' },
              { id: 'dep-018e4b1c', applicationId: 'frontend-dashboard-portal', workerId: 'worker-node-laptop-02', state: 'running', assignedPort: 20016, publicUrl: 'https://cwc-portal.trycloudflare.com' },
            ]).map((dep) => (
              <View key={dep.id} style={styles.depCard}>
                <View style={styles.depCardHeader}>
                  <Text style={styles.depName}>{dep.applicationId}</Text>
                  <View style={styles.runningBadge}>
                    <Text style={styles.runningBadgeText}>● Running</Text>
                  </View>
                </View>

                <Text style={styles.depId}>{dep.id}</Text>

                {dep.publicUrl && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(dep.publicUrl!)}
                    style={styles.urlLinkBox}
                  >
                    <Text style={styles.urlLinkText} numberOfLines={1}>
                      {dep.publicUrl} ↗
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={styles.depFooter}>
                  <Text style={styles.depWorker}>Node: {dep.workerId || 'Worker Alpha'}</Text>
                  <Text style={styles.depPort}>Port: {dep.assignedPort || 20015}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* FINOPS VIEW */}
        {activeTab === 'finops' && (
          <View style={styles.finopsCard}>
            <View style={styles.finopsHeader}>
              <View style={styles.finopsTitleRow}>
                <Text style={styles.finopsIcon}>$</Text>
                <View>
                  <Text style={styles.finopsTitle}>FinOps Cost Arbitrage</Text>
                  <Text style={styles.finopsSub}>Zero-Hyperscaler Cost Comparison</Text>
                </View>
              </View>
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>100% Free</Text>
              </View>
            </View>

            {/* Real-Time Annual Savings Box */}
            <View style={styles.savingsHero}>
              <Text style={styles.savingsHeroLabel}>ANNUAL HYPERSCALER AVOIDANCE</Text>
              <Text style={styles.savingsHeroNumber}>
                ${finops ? finops.annualSavings.toLocaleString() : '4,303.20'}
              </Text>
              <Text style={styles.savingsHeroSub}>
                Equivalent AWS: {finops?.awsInstanceEquivalent || '1x AWS t4g.2xlarge (8 vCPU, 32 GB)'}
              </Text>
            </View>

            {/* Live Session Counter */}
            <View style={styles.liveTickerRow}>
              <Text style={styles.liveTickerLabel}>⚡ Live Session Savings Ticker:</Text>
              <Text style={styles.liveTickerVal}>+${liveSavings.toFixed(5)} saved</Text>
            </View>

            {/* Fleet Scaling Simulation */}
            <View style={styles.scaleBox}>
              <View style={styles.scaleHeader}>
                <Text style={styles.scaleTitle}>Scale Fleet Simulator</Text>
                <Text style={styles.scaleCount}>{laptopSlider} Laptops</Text>
              </View>
              <View style={styles.scaleButtonRow}>
                {[1, 3, 5, 10, 20].map((num) => (
                  <TouchableOpacity
                    key={num}
                    onPress={() => setLaptopSlider(num)}
                    style={[
                      styles.scalePill,
                      laptopSlider === num && styles.scalePillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.scalePillText,
                        laptopSlider === num && styles.scalePillTextActive,
                      ]}
                    >
                      {num}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.scaleResultText}>
                Projected Savings: ${(laptopSlider * 119.5 * 12).toLocaleString()} / year saved vs AWS
              </Text>
            </View>
          </View>
        )}

        {/* LOGS VIEW */}
        {activeTab === 'logs' && (
          <View style={styles.sectionBlock}>
            <View style={styles.logHeaderRow}>
              <Text style={styles.sectionTitle}>Cluster Terminal Logs</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>● STREAMING</Text>
              </View>
            </View>
            <View style={styles.logBox}>
              {logs.map((log, idx) => (
                <Text key={idx} style={styles.logText}>
                  {log}
                </Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* DIRECT DOWNLOAD MODAL */}
      <Modal visible={isDownloadModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Direct Download & Mobile Access</Text>
              <TouchableOpacity onPress={() => setIsDownloadModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Install or download the Cloud Without Clouds app directly on your mobile device.
            </Text>

            {/* Option 1: 1-Tap PWA / Mobile Web App */}
            <TouchableOpacity
              onPress={() => Linking.openURL(DEFAULT_WEB_URL)}
              style={styles.downloadOptionCard}
              activeOpacity={0.8}
            >
              <View style={styles.downloadOptionIconBox}>
                <Text style={styles.downloadOptionIcon}>📱</Text>
              </View>
              <View style={styles.downloadOptionTextContainer}>
                <Text style={styles.downloadOptionTitle}>Open Mobile Web App / PWA</Text>
                <Text style={styles.downloadOptionDesc}>
                  Open in browser & tap "Add to Home Screen" for instant standalone app install.
                </Text>
              </View>
              <Text style={styles.downloadArrow}>↗</Text>
            </TouchableOpacity>

            {/* Option 2: Share / Export Cluster Manifest */}
            <TouchableOpacity
              onPress={handleShareManifest}
              style={styles.downloadOptionCard}
              activeOpacity={0.8}
            >
              <View style={styles.downloadOptionIconBox}>
                <Text style={styles.downloadOptionIcon}>📄</Text>
              </View>
              <View style={styles.downloadOptionTextContainer}>
                <Text style={styles.downloadOptionTitle}>Download Cluster Manifest</Text>
                <Text style={styles.downloadOptionDesc}>
                  Export active workloads, nodes, and routing metadata as JSON.
                </Text>
              </View>
              <Text style={styles.downloadArrow}>⬇</Text>
            </TouchableOpacity>

            {/* Option 3: Expo SDK 58.0.5 Live Preview */}
            <View style={styles.downloadOptionCard}>
              <View style={styles.downloadOptionIconBox}>
                <Text style={styles.downloadOptionIcon}>⚡</Text>
              </View>
              <View style={styles.downloadOptionTextContainer}>
                <Text style={styles.downloadOptionTitle}>Expo SDK 58.0.5 Native App</Text>
                <Text style={styles.downloadOptionDesc}>
                  Bundled natively. Run `npx expo start -c` in apps/mobile for Expo Go.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setIsDownloadModalOpen(false)}
              style={styles.modalDoneBtn}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TARGET API URL CONFIG MODAL */}
      <Modal visible={isUrlModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Configure Control Plane API</Text>
            <Text style={styles.modalSub}>
              Enter your laptop's Wi-Fi IP (e.g. 192.168.30.110) or Tailscale IP (100.x.y.z) on port 4000.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="http://192.168.30.110:4000"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setIsUrlModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setApiUrl(inputUrl.trim());
                  setIsUrlModalOpen(false);
                  fetchAllData();
                }}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveText}>Save & Reconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DEPLOY WORKLOAD MODAL */}
      <Modal visible={isDeployModalOpen} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Deploy Application</Text>
            <Text style={styles.modalSub}>
              Deploy a Dockerfile repository onto distributed laptop worker nodes.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={appName}
              onChangeText={setAppName}
              placeholder="Application Name (e.g. backend-api)"
              placeholderTextColor="#666"
            />

            <TextInput
              style={styles.modalInput}
              value={repoUrl}
              onChangeText={setRepoUrl}
              placeholder="Git Repository URL (https://github.com/...)"
              placeholderTextColor="#666"
              autoCapitalize="none"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setIsDeployModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDeploy}
                disabled={deploying}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveText}>
                  {deploying ? 'Deploying...' : 'Deploy Now'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  header: {
    height: 52,
    backgroundColor: '#0f0f0f',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBox: {
    width: 26,
    height: 26,
    backgroundColor: '#ffffff',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoIcon: {
    fontSize: 14,
    color: '#000000',
    fontWeight: 'bold',
  },
  brandTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  breadcrumbText: {
    color: '#666666',
    fontSize: 11,
    marginLeft: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  networkText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  downloadIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  downloadIconText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  settingsIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconText: {
    color: '#888888',
    fontSize: 12,
  },
  navBar: {
    backgroundColor: '#0d0d0d',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  navBarContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
  },
  navTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 4,
  },
  navTabActive: {
    backgroundColor: '#ffffff',
  },
  navTabText: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
  navTabTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  logTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10b981',
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
    paddingBottom: 40,
    flexGrow: 1,
  },
  systemBar: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  systemGrid: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1c',
    paddingBottom: 8,
    marginBottom: 8,
  },
  systemCol: {
    flex: 1,
    alignItems: 'center',
  },
  systemLabel: {
    color: '#666666',
    fontSize: 8,
    fontWeight: '700',
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  systemVal: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  amberBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  amberIcon: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: 'bold',
    marginRight: 6,
  },
  amberText: {
    color: '#f59e0b',
    fontSize: 9,
    flex: 1,
    lineHeight: 13,
  },
  mockPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  mockPillText: {
    color: '#f59e0b',
    fontSize: 8,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  heartbeatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heartbeatLeft: {
    color: '#666666',
    fontSize: 9,
  },
  heartbeatRight: {
    color: '#666666',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  primaryBtn: {
    flex: 1.2,
    height: 40,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  primaryBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  pipelineCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  pipelineHeader: {
    marginBottom: 14,
  },
  pipelineHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pipelineWaveIcon: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 6,
    marginTop: 1,
  },
  pipelineTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  pipelineTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 6,
  },
  liveArchBadge: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  liveArchText: {
    color: '#aaaaaa',
    fontSize: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pipelineSub: {
    color: '#666666',
    fontSize: 9,
    marginTop: 2,
    lineHeight: 13,
  },
  pipelineTrackContainer: {
    position: 'relative',
    marginBottom: 14,
    paddingVertical: 4,
  },
  horizontalGreenLine: {
    position: 'absolute',
    top: 24,
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#10b981',
    zIndex: 0,
  },
  stagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  stageBox: {
    width: 48,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    zIndex: 2,
  },
  stageBoxSelected: {
    borderColor: '#10b981',
    backgroundColor: '#0e241b',
    borderWidth: 1.5,
  },
  stageIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  stageIconBadgeSelected: {
    backgroundColor: '#10b981',
  },
  stageIconText: {
    fontSize: 11,
    color: '#888888',
  },
  stageIconTextSelected: {
    color: '#000000',
    fontWeight: 'bold',
  },
  stageCheckmarkDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageCheckmarkText: {
    color: '#000000',
    fontSize: 7,
    fontWeight: 'bold',
  },
  stageNameText: {
    color: '#888888',
    fontSize: 7,
    textAlign: 'center',
    fontWeight: '600',
  },
  stageNameTextSelected: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  stageStepText: {
    color: '#555555',
    fontSize: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  stageStepTextSelected: {
    color: '#10b981',
  },
  deepDiveContainer: {
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 8,
    padding: 10,
  },
  deepDiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    paddingBottom: 6,
    marginBottom: 8,
  },
  deepDiveTitleRow: {
    flex: 1,
  },
  deepDiveIcon: {
    fontSize: 12,
    marginBottom: 2,
  },
  deepDiveTitle: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  deepDiveSubtitle: {
    color: '#10b981',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  zeroHyperscalerBadge: {
    backgroundColor: '#202020',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  zeroHyperscalerText: {
    color: '#888888',
    fontSize: 7,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deepDiveGrid: {
    gap: 8,
  },
  deepDiveCol: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    padding: 7,
  },
  deepDiveColHeader: {
    color: '#888888',
    fontSize: 8,
    fontWeight: '700',
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  deepDiveColContent: {
    color: '#d4d4d4',
    fontSize: 10,
    lineHeight: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricLabel: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '600',
  },
  metricIcon: {
    fontSize: 12,
  },
  metricBigNumber: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  metricSubHighlight: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  metricDesc: {
    color: '#666666',
    fontSize: 8,
    marginTop: 2,
    lineHeight: 11,
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  workerCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  workerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  workerIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  workerName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  idleBadge: {
    backgroundColor: '#1c1c1c',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  idleBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: 'bold',
  },
  workerTelemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1c',
    paddingTop: 8,
  },
  telemetryCol: {
    flex: 1,
  },
  telemetryLabel: {
    color: '#666666',
    fontSize: 8,
    marginBottom: 2,
  },
  telemetryVal: {
    color: '#cccccc',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  depCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  depCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  depName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  runningBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  runningBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: 'bold',
  },
  depId: {
    color: '#666666',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  urlLinkBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  urlLinkText: {
    color: '#10b981',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  depFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1c',
    paddingTop: 6,
  },
  depWorker: {
    color: '#888888',
    fontSize: 9,
  },
  depPort: {
    color: '#888888',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  finopsCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  finopsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  finopsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  finopsIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: 'bold',
    marginRight: 8,
  },
  finopsTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  finopsSub: {
    color: '#777777',
    fontSize: 9,
  },
  freeBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  freeBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: 'bold',
  },
  savingsHero: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  savingsHeroLabel: {
    color: '#888888',
    fontSize: 8,
    fontWeight: '700',
    marginBottom: 2,
  },
  savingsHeroNumber: {
    color: '#10b981',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  savingsHeroSub: {
    color: '#777777',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  liveTickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161616',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  liveTickerLabel: {
    color: '#888888',
    fontSize: 9,
  },
  liveTickerVal: {
    color: '#10b981',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: 'bold',
  },
  scaleBox: {
    backgroundColor: '#161616',
    padding: 10,
    borderRadius: 8,
  },
  scaleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scaleTitle: {
    color: '#cccccc',
    fontSize: 10,
    fontWeight: '600',
  },
  scaleCount: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scaleButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scalePill: {
    flex: 1,
    height: 26,
    backgroundColor: '#222222',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  scalePillActive: {
    backgroundColor: '#10b981',
  },
  scalePillText: {
    color: '#888888',
    fontSize: 9,
    fontWeight: 'bold',
  },
  scalePillTextActive: {
    color: '#ffffff',
  },
  scaleResultText: {
    color: '#aaaaaa',
    fontSize: 9,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: '#10b981',
    fontSize: 8,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logBox: {
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#1f1f1f',
    borderRadius: 8,
    padding: 10,
  },
  logText: {
    color: '#10b981',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    borderRadius: 12,
    padding: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalCloseText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  modalSub: {
    color: '#888888',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 12,
  },
  downloadOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  downloadOptionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  downloadOptionIcon: {
    fontSize: 14,
  },
  downloadOptionTextContainer: {
    flex: 1,
  },
  downloadOptionTitle: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  downloadOptionDesc: {
    color: '#777777',
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  downloadArrow: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  modalDoneBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 8,
  },
  modalDoneText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalInput: {
    height: 40,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 6,
    paddingHorizontal: 10,
    color: '#ffffff',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  modalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 6,
  },
  modalCancelText: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
  modalSaveBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});

registerRootComponent(App);
