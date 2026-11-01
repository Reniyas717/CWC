import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { clearSessionCookie, createSessionCookie, readSessionCookie } from '../services/auth-session.js';

export const authRouter: Router = Router();
const STATE_COOKIE = 'cwc_oauth_state';
const callbackUrl = `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/auth/github/callback`;
const isSecure = env.PUBLIC_API_URL.startsWith('https://');

function setStateCookie(res: Response, state: string): void {
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=${state}; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=600${isSecure ? '; Secure' : ''}`);
}

function clearStateCookie(res: Response): void {
  res.append('Set-Cookie', `${STATE_COOKIE}=; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`);
}

function cookieValue(req: Request, name: string): string | null {
  return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

authRouter.get('/github', (_req, res) => {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    res.redirect(`${env.CORS_ORIGIN.split(',')[0].trim()}/login?oauth_error=not_configured`);
    return;
  }
  const state = randomBytes(32).toString('base64url');
  setStateCookie(res, state);
  const authorization = new URL('https://github.com/login/oauth/authorize');
  authorization.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorization.searchParams.set('redirect_uri', callbackUrl);
  authorization.searchParams.set('scope', 'read:user user:email');
  authorization.searchParams.set('state', state);
  res.redirect(302, authorization.toString());
});

authRouter.get('/github/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieState = cookieValue(req, STATE_COOKIE) ?? '';
  clearStateCookie(res);
  if (!state || !cookieState || state.length !== cookieState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
    res.status(400).send('OAuth state validation failed. Return to the app and try signing in again.');
    return;
  }
  if (typeof req.query.error === 'string') {
    res.redirect(`${env.CORS_ORIGIN.split(',')[0].trim()}/login?oauth_error=cancelled`);
    return;
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || typeof req.query.code !== 'string') {
    res.status(400).send('GitHub authorization could not be completed.');
    return;
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: req.query.code, redirect_uri: callbackUrl }),
      signal: AbortSignal.timeout(10000),
    });
    const token = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error('GitHub did not issue an access token.');

    const githubResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(10000),
    });
    if (!githubResponse.ok) throw new Error('GitHub identity lookup failed.');
    const githubUser = await githubResponse.json() as { id?: number; login?: string; name?: string | null; avatar_url?: string };
    if (typeof githubUser.id !== 'number' || !githubUser.login) throw new Error('GitHub returned an incomplete user identity.');

    res.setHeader('Set-Cookie', [
      `${STATE_COOKIE}=; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`,
      createSessionCookie({ id: `github:${githubUser.id}`, login: githubUser.login, name: githubUser.name || githubUser.login, avatarUrl: githubUser.avatar_url ?? null }, isSecure),
    ]);
    res.redirect(`${env.CORS_ORIGIN.split(',')[0].trim()}/`);
  } catch (error) {
    console.error('[Auth] GitHub OAuth callback failed:', error instanceof Error ? error.message : 'unknown error');
    res.redirect(`${env.CORS_ORIGIN.split(',')[0].trim()}/login?oauth_error=failed`);
  }
});

authRouter.get('/session', (req, res) => {
  const session = readSessionCookie(req.headers.cookie);
  if (!session) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } });
    return;
  }
  res.json({ success: true, data: { id: session.id, login: session.login, name: session.name, avatarUrl: session.avatarUrl } });
});

authRouter.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie(isSecure));
  res.status(204).end();
});
