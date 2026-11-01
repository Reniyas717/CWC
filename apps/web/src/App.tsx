import * as React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { WorkersPage } from './pages/WorkersPage';
import { DeploymentsPage } from './pages/DeploymentsPage';
import { EqualizerPage } from './pages/EqualizerPage';
import { FinOpsPage } from './pages/FinOpsPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SignInPage } from './pages/SignInPage';
import { ContributeLaptopPage } from './pages/ContributeLaptopPage';
import { MyWorkerPage } from './pages/MyWorkerPage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

export function App() {
  const [signedIn, setSignedIn] = React.useState(false);
  const [authChecked, setAuthChecked] = React.useState(false);
  React.useEffect(() => {
    fetch(`${API_URL}/api/auth/session`, { credentials: 'include' })
      .then((response) => setSignedIn(response.ok))
      .catch(() => setSignedIn(false))
      .finally(() => setAuthChecked(true));
  }, []);
  const signOut = async () => {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setSignedIn(false);
  };
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!authChecked ? <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Checking sign-in…</div> : signedIn ? <Navigate to="/" replace /> : <SignInPage />} />
          <Route path="/" element={!authChecked ? <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Checking sign-in…</div> : signedIn ? <AppLayout onSignOut={signOut} /> : <Navigate to="/login" replace />}>
            <Route index element={<DashboardPage />} />
            <Route path="apps" element={<ApplicationsPage />} />
            <Route path="workers" element={<WorkersPage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="equalizer" element={<EqualizerPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="finops" element={<FinOpsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="contribute" element={<ContributeLaptopPage />} />
            <Route path="my-worker" element={<MyWorkerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
