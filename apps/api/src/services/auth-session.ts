import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export interface UserSession {
  id: string;
  login: string;
  name: string;
  avatarUrl: string | null;
  exp: number;
}

const COOKIE_NAME = 'cwc_session';

function signature(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
}

export function createSessionCookie(user: Omit<UserSession, 'exp'>, secure: boolean): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + 7 * 86400 })).toString('base64url');
  const value = `${payload}.${signature(payload)}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function readSessionCookie(cookieHeader?: string): UserSession | null {
  const value = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(payload));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UserSession;
    if (typeof session.id !== 'string' || typeof session.login !== 'string' || session.exp <= Date.now() / 1000) return null;
    return session;
  } catch {
    return null;
  }
}
