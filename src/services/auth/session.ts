import { readById } from '../../data/readers';
import type { User } from '../../domain/models';
import { isUserRole } from '../../lib/permissions';
import { clearSession, isSessionExpired, refreshSession } from '../../lib/security';
import { mustChangeLocalPassword } from './passwords';

export type SessionUser = Omit<User, 'passwordHash'>;
export const SESSION_KEY = 'educenter_session';
export const MUST_CHANGE_PASSWORD_KEY = 'educenter_must_change_pw';

export function toSessionUser(user: User): SessionUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export function saveLocalSession(user: SessionUser, mustChangePassword: boolean): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, mustChangePassword }));
  sessionStorage.setItem('educenter_session_ts', String(Date.now()));
  if (mustChangePassword) sessionStorage.setItem(MUST_CHANGE_PASSWORD_KEY, 'true');
  else sessionStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
}

export function restoreLocalSession(): SessionUser | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    if (isSessionExpired()) {
      clearLocalSession();
      return null;
    }
    const stored = JSON.parse(raw) as User;
    if (!stored || typeof stored.id !== 'string' || typeof stored.username !== 'string' || !isUserRole(stored.role)) {
      clearLocalSession();
      return null;
    }
    const safe = toSessionUser(stored);
    // Clean legacy sessions too; never persist a password hash in sessionStorage.
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    refreshSession();
    return safe;
  } catch {
    clearLocalSession();
    return null;
  }
}

export function clearLocalSession(): void {
  clearSession();
  sessionStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
}

/** Resolve current local identity without publishing it: the provider checks its request token after await. */
export async function resolveLocalSession(): Promise<SessionUser | null> {
  const cached = restoreLocalSession();
  if (!cached) return null;
  const current = await readById('users', cached.id);
  if (!current || !isUserRole(current.role)) return null;
  return { ...toSessionUser(current), mustChangePassword: mustChangeLocalPassword(current) };
}
