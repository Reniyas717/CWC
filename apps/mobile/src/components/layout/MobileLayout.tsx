import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileDeploySheet } from '@/components/deploy/MobileDeploySheet';
import { useQueryClient } from '@tanstack/react-query';
import { haptics } from '@/lib/haptics';

export interface MobileLayoutProps {
  onSignOut?: () => void;
}

export function MobileLayout({ onSignOut }: MobileLayoutProps) {
  const [deploySheetOpen, setDeploySheetOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary/20">
      {/* Top Mobile Header (Matching PC Header exactly) */}
      <MobileHeader onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      {/* Main Scrollable View */}
      <main className="flex-1 w-full overflow-x-hidden">
        <Outlet context={{ onSignOut }} />
      </main>

      {/* Floating Action Button (FAB) for Quick Deploy */}
      <button
        onClick={() => {
          haptics.medium();
          setDeploySheetOpen(true);
        }}
        className="fixed bottom-16 right-4 z-40 h-11 w-11 rounded-full bg-foreground text-background shadow-md flex items-center justify-center active:scale-95 transition-all hover:bg-foreground/90 focus:outline-none cursor-pointer"
        aria-label="Deploy Workload"
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <MobileBottomNav />

      {/* Global Deploy Sheet */}
      <MobileDeploySheet
        isOpen={deploySheetOpen}
        onClose={() => setDeploySheetOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries();
        }}
      />
    </div>
  );
}
