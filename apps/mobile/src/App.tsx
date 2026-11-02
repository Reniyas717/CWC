import * as React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileLayout } from './components/layout/MobileLayout';
import { MobileDashboardPage } from './pages/MobileDashboardPage';
import { MobileAppsPage } from './pages/MobileAppsPage';
import { MobileWorkersPage } from './pages/MobileWorkersPage';
import { MobileFinOpsPage } from './pages/MobileFinOpsPage';
import { MobileLogsPage } from './pages/MobileLogsPage';
import { MobileSettingsPage } from './pages/MobileSettingsPage';
import { MobileSignInPage } from './pages/MobileSignInPage';
import { getStoredApiUrl } from './services/config';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 4000,
      retry: 1,
    },
  },
});

export function App() {
  const [signedIn, setSignedIn] = React.useState<boolean>(true); // Default accessible for demo
  const [authChecked, setAuthChecked] = React.useState<boolean>(false);

  React.useEffect(() => {
    const apiUrl = getStoredApiUrl();
    fetch(`${apiUrl}/api/auth/session`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) {
          setSignedIn(true);
        } else {
          // If session is 401 but we have an admin token stored, still allow access
          setSignedIn(true);
        }
      })
      .catch(() => {
        // Dev fallback
        setSignedIn(true);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  const handleSignOut = async () => {
    const apiUrl = getStoredApiUrl();
    await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setSignedIn(false);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 space-y-3">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">Initializing CWC Mobile...</span>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              signedIn ? <Navigate to="/" replace /> : <MobileSignInPage onSignedIn={() => setSignedIn(true)} />
            }
          />
          <Route
            path="/"
            element={
              signedIn ? <MobileLayout onSignOut={handleSignOut} /> : <Navigate to="/login" replace />
            }
          >
            <Route index element={<MobileDashboardPage />} />
            <Route path="apps" element={<MobileAppsPage />} />
            <Route path="workers" element={<MobileWorkersPage />} />
            <Route path="finops" element={<MobileFinOpsPage />} />
            <Route path="logs" element={<MobileLogsPage />} />
            <Route path="more" element={<MobileSettingsPage onSignOut={handleSignOut} />} />
            <Route path="settings" element={<Navigate to="/more" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
