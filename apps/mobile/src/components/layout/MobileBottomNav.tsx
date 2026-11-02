import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Layers, Cpu, Coins, Terminal } from 'lucide-react';
import { haptics } from '@/lib/haptics';

export function MobileBottomNav() {
  const location = useLocation();

  const navItems = [
    {
      to: '/',
      label: 'Dashboard',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      to: '/apps',
      label: 'Apps',
      icon: Layers,
    },
    {
      to: '/workers',
      label: 'Workers',
      icon: Cpu,
    },
    {
      to: '/finops',
      label: 'FinOps',
      icon: Coins,
    },
    {
      to: '/logs',
      label: 'Logs',
      icon: Terminal,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 backdrop-blur-md pb-safe">
      <div className="flex items-center justify-around h-13 max-w-lg mx-auto px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => haptics.light()}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-150 select-none relative ${
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <span className="absolute -top-0.5 w-6 h-0.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              )}
              <Icon className={`h-4 w-4 mb-0.5 transition-transform duration-150 ${isActive ? 'scale-110 text-emerald-500' : ''}`} />
              <span className={`text-[10px] tracking-tight ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
