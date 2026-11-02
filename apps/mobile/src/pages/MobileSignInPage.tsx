import * as React from 'react';
import { Cloud, ArrowRight, ShieldCheck, Github, Key } from 'lucide-react';
import { Card, CardContent } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { getStoredApiUrl, setStoredAdminToken, getStoredAdminToken } from '@/services/config';
import { haptics } from '@/lib/haptics';

export interface MobileSignInPageProps {
  onSignedIn?: () => void;
}

export function MobileSignInPage({ onSignedIn }: MobileSignInPageProps) {
  const [token, setToken] = React.useState(getStoredAdminToken());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    try {
      setLoading(true);
      setError(null);
      haptics.medium();
      setStoredAdminToken(token.trim());

      const apiUrl = getStoredApiUrl();
      const res = await fetch(`${apiUrl}/api/auth/token-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: token.trim() }),
      }).catch(() => null);

      if (res && !res.ok) {
        // If server actively rejected token
        const body = await res.json().catch(() => ({}));
        setError(body.error?.message || 'Invalid administrator token');
        setLoading(false);
        return;
      }

      // Successful or dev fallback
      haptics.success();
      setLoading(false);
      onSignedIn?.();
    } catch {
      // In offline / dev fallback mode, allow proceed
      haptics.success();
      setLoading(false);
      onSignedIn?.();
    }
  };

  const handleGitHubAuth = () => {
    haptics.medium();
    const apiUrl = getStoredApiUrl();
    window.location.href = `${apiUrl}/api/auth/github`;
  };

  const handleQuickDemo = () => {
    haptics.light();
    setToken('dev-admin-token-change-in-production');
    setStoredAdminToken('dev-admin-token-change-in-production');
    onSignedIn?.();
  };

  return (
    <div className="min-h-screen flex flex-col justify-between px-4 py-6 max-w-md mx-auto">
      {/* Top Bar with Logo & Theme Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <Cloud className="h-4 w-4" />
          </div>
          <span className="font-heading font-bold text-sm tracking-tight text-foreground">
            Cloud Without Clouds
          </span>
        </div>
        <ThemeToggle />
      </div>

      {/* Main Sign In Form Card */}
      <div className="my-auto space-y-4">
        <div className="text-center space-y-1">
          <h1 className="font-heading font-extrabold text-2xl text-foreground">
            Mobile Cloud Controller
          </h1>
          <p className="text-xs text-muted-foreground">
            Sign in to inspect and orchestrate your distributed laptop fleet.
          </p>
        </div>

        <Card className="border-border/80 bg-card shadow-lg">
          <CardContent className="p-4 space-y-3.5">
            {error && (
              <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleGitHubAuth}
              className="w-full space-x-2 h-11 border-border/80 bg-secondary/30"
            >
              <Github className="h-4 w-4" />
              <span>Continue with GitHub</span>
            </Button>

            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-border w-full" />
              <span className="bg-card px-2 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider absolute">
                Or with Admin Token
              </span>
            </div>

            <form onSubmit={handleTokenSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground flex items-center space-x-1">
                  <Key className="h-3 w-3 text-muted-foreground" />
                  <span>Admin Secret Token</span>
                </label>
                <Input
                  type="password"
                  placeholder="Enter token..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <Button
                type="submit"
                variant="emerald"
                size="lg"
                disabled={loading}
                className="w-full space-x-2"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="pt-2 border-t border-border/40 text-center">
              <button
                type="button"
                onClick={handleQuickDemo}
                className="text-xs font-semibold text-emerald-500 hover:underline"
              >
                Skip & Enter Demo Mode →
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer Security Badge */}
      <div className="text-center text-[10px] text-muted-foreground flex items-center justify-center space-x-1">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        <span>Secured via Tailscale WireGuard overlay mesh</span>
      </div>
    </div>
  );
}
