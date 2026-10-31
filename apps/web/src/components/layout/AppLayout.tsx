import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Cloud,
  Cpu,
  Layers,
  LayoutDashboard,
  Terminal,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  ExternalLink,
  Workflow,
  Scale,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { api } from '@/services/api';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'workers' | 'deployments' | 'logs';
}

const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: 'Platform',
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard }],
  },
  {
    group: 'Compute',
    items: [
      { label: 'Applications', path: '/apps', icon: Layers },
      { label: 'Worker Nodes', path: '/workers', icon: Cpu, badgeKey: 'workers' },
      { label: 'Deployments', path: '/deployments', icon: Workflow, badgeKey: 'deployments' },
      { label: 'Cluster Equalizer', path: '/equalizer', icon: Scale },
      { label: 'Cluster Logs', path: '/logs', icon: Terminal, badgeKey: 'logs' },
    ],
  },
  {
    group: 'System',
    items: [{ label: 'Settings', path: '/settings', icon: Settings }],
  },
];

export function AppLayout() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cwc_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  // Live cluster stats for sidebar badges
  const { data: workers = [] } = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 10000,
  });

  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 10000,
  });

  const onlineWorkersCount = workers.filter((w) => w.state !== 'offline').length;
  const activeDeploymentsCount = deployments.filter((d) => d.state === 'running').length;

  // Close mobile drawer on route change
  React.useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('cwc_sidebar_collapsed', String(next));
      return next;
    });
  };

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Overview';
      case '/apps':
        return 'Applications';
      case '/workers':
        return 'Worker Nodes';
      case '/deployments':
        return 'Deployments';
      case '/equalizer':
        return 'Cluster Resource Equalizer';
      case '/logs':
        return 'Cluster Logs';
      case '/settings':
        return 'Settings';
      default:
        return 'Console';
    }
  };

  const renderBadge = (key?: NavItem['badgeKey'], isActive?: boolean) => {
    if (!key) return null;
    if (key === 'workers') {
      return (
        <span
          className={`ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded transition-colors ${
            isActive
              ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground font-semibold'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {onlineWorkersCount}
        </span>
      );
    }
    if (key === 'deployments') {
      return (
        <span
          className={`ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded transition-colors ${
            isActive
              ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground font-semibold'
              : 'bg-secondary text-muted-foreground'
          }`}
        >
          {activeDeploymentsCount}
        </span>
      );
    }
    if (key === 'logs') {
      return (
        <span className="ml-auto flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span
            className={`text-[9px] font-mono uppercase tracking-wider ${
              isActive ? 'text-sidebar-primary-foreground' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            Live
          </span>
        </span>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans selection:bg-primary/10">
      {/* Top Navbar: Clean, Quiet, Fixed */}
      <header className="sticky top-0 z-30 h-13 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-xs flex items-center justify-between px-3 sm:px-5">
        {/* Left Side: Mobile Toggle & Brand */}
        <div className="flex items-center gap-2.5">
          {/* Mobile Drawer Toggle (Only visible on mobile screens) */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="md:hidden h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-sidebar-accent focus:outline-none cursor-pointer"
            aria-label="Open navigation menu"
          >
            {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Brand Identity */}
          <NavLink to="/" className="flex items-center gap-2 group">
            <div className="h-7 w-7 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold shadow-2xs">
              <Cloud className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">
              Cloud Without Clouds
            </span>
          </NavLink>

          <span className="text-muted-foreground/40 mx-1 hidden sm:inline">/</span>

          {/* Active Section Breadcrumb */}
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
            {getPageTitle()}
          </span>
        </div>

        {/* Right Side: Network Status, Theme Toggle & Repo Link */}
        <div className="flex items-center gap-2">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground bg-secondary/60 border border-border">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span className="hidden sm:inline">Network</span>
            <span>Online</span>
          </div>

          <div className="h-4 w-px bg-sidebar-border mx-0.5"></div>

          {/* Theme Toggle (Light / Dark) */}
          <ThemeToggle />

          {/* Git Source Preset Link */}
          <a
            href="https://github.com/BnB-26-Final-Round/Team-Pony_Final-Round"
            target="_blank"
            rel="noreferrer"
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
            title="GitHub Repository"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex w-full">
        {/* Desktop Sticky Collapsible Sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar sticky top-13 h-[calc(100vh-3.25rem)] transition-all duration-200 ease-in-out shrink-0 select-none ${
            isCollapsed ? 'w-14' : 'w-56'
          }`}
        >
          {/* Single, Dedicated Collapse Header */}
          <div className="h-10 px-2.5 border-b border-sidebar-border flex items-center justify-between shrink-0">
            {!isCollapsed ? (
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Navigation
                </span>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={toggleSidebar}
                className="h-7 w-7 mx-auto rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Navigation Links */}
          <div className="flex-1 py-3 px-2 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar">
            {NAV_GROUPS.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                {!isCollapsed && (
                  <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                    {group.group}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      title={isCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `flex items-center rounded-md text-xs font-medium transition-colors ${
                          isCollapsed
                            ? 'h-9 w-9 mx-auto justify-center'
                            : 'h-8 px-2.5 gap-2.5 w-full'
                        } ${
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!isCollapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {renderBadge(item.badgeKey, location.pathname === item.path)}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Clean Sidebar Footer: Version Tag Only (No duplicate buttons) */}
          <div className="p-3 border-t border-sidebar-border shrink-0 text-center font-mono text-[10px] text-muted-foreground/50 tracking-wider">
            {!isCollapsed ? 'cwc v0.1.0' : 'v0.1'}
          </div>
        </aside>

        {/* Mobile Backdrop */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-xs md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Mobile Slide-Over Drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col md:hidden transition-transform duration-200 ease-in-out ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-13 border-b border-sidebar-border flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold">
                <Cloud className="h-4 w-4" />
              </div>
              <span className="font-semibold text-sm text-foreground">
                Cloud Without Clouds
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 py-4 px-3 space-y-4 overflow-y-auto">
            {NAV_GROUPS.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  {group.group}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }`
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      {renderBadge(item.badgeKey, location.pathname === item.path)}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground font-mono">
            <div>Peer Mesh Fabric</div>
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">Control Plane API :4000</div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Persistent Global Footer */}
      <footer className="border-t border-border bg-card py-3 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>Cloud Without Clouds • Self-Service Peer Compute Fabric</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-3">
            <span>Tailscale</span>
            <span>•</span>
            <span>Vite</span>
            <span>•</span>
            <span>Express</span>
            <span>•</span>
            <span>PostgreSQL</span>
            <span>•</span>
            <span>Redis</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
