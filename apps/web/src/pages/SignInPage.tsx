import { Cloud, Github, ShieldCheck, CircleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function SignInPage() {
  const [params] = useSearchParams();
  const oauthError = params.get('oauth_error');
  const errorMessage =
    oauthError === 'not_configured'
      ? 'GitHub OAuth is not configured in the API environment yet.'
      : oauthError
        ? 'GitHub sign-in did not complete. Please try again.'
        : '';

  const beginGithubLogin = () => {
    window.location.assign(`${API_URL}/api/auth/github`);
  };

  return (
    <main className="min-h-screen bg-background text-foreground grid lg:grid-cols-[1.1fr_.9fr] relative">
      {/* Top-Right Theme Toggle with Glassmorphic Frame */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex items-center rounded-lg border border-border/60 bg-card/80 backdrop-blur-sm p-1 shadow-2xs">
        <ThemeToggle />
      </div>

      {/* Left Branding Hero Section */}
      <section className="hidden lg:flex flex-col justify-between p-12 xl:p-20 bg-sidebar border-r border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Cloud className="h-5 w-5" />
          </div>
          <span
            className="font-semibold tracking-tight text-lg"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Cloud Without Clouds
          </span>
        </div>

        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-[.2em] text-muted-foreground font-semibold">
            Community-powered compute
          </p>
          <h1
            className="mt-5 text-5xl font-semibold leading-tight tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Your apps.
            <br />
            A network of laptops.
          </h1>
          <p className="mt-5 text-muted-foreground max-w-md text-sm leading-relaxed">
            Deploy web apps to developer-owned machines or contribute your own laptop to the compute
            mesh with zero cloud bills.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          Secure sign-in is provided by your verified identity provider.
        </p>
      </section>

      {/* Right Sign-In Action Section */}
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Cloud className="h-5 w-5" />
            </div>
            <span
              className="font-semibold text-base"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              Cloud Without Clouds
            </span>
          </div>

          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-7 sm:p-9">
              <div className="h-11 w-11 rounded-xl bg-secondary grid place-items-center text-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <p className="mt-6 text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                Welcome
              </p>
              <h2
                className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
              >
                Sign in to your workspace
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Use your identity provider to access deployments, fleet nodes, and FinOps analytics.
              </p>

              <div className="mt-7 grid gap-3">
                <Button
                  variant="outline"
                  className="h-11 justify-start gap-3 cursor-pointer text-sm font-medium hover:bg-secondary/80 transition-colors"
                  onClick={beginGithubLogin}
                >
                  <Github className="h-4 w-4 shrink-0" />
                  <span>Continue with GitHub</span>
                </Button>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                >
                  <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <p className="mt-6 text-center text-[11px] text-muted-foreground">
                By continuing, you agree to use cluster compute resources responsibly.
              </p>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Build on a shared network. Contribute only what you choose.
          </p>
        </div>
      </section>
    </main>
  );
}
