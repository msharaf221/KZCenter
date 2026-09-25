import { migrateAuditFromLocalStorage } from '../../lib/audit';
import {
  checkRateLimit,
  isGloballyBlocked,
  recordGlobalFailedAttempt,
  recordLoginAttempt,
  resetGlobalFailedAttempts,
} from '../../lib/security';
import { getUserByUsername, seedDefaultData } from '../bootstrap';
import { mustChangeLocalPassword, passwordMatches } from './passwords';
import { toSessionUser, type SessionUser } from './session';

export interface LoginAttempt {
  success: boolean;
  user?: SessionUser;
  mustChangePassword?: boolean;
  rateLimitInfo?: ReturnType<typeof checkRateLimit>;
  message?: string;
  warning?: boolean;
}

let initialization: Promise<void> | null = null;
export function initializeAuthentication(): Promise<void> {
  if (initialization) return initialization;
  const work = (async () => {
    await seedDefaultData();
    await migrateAuditFromLocalStorage();
  })().finally(() => {
    if (initialization === work) initialization = null;
  });
  initialization = work;
  return work;
}

/** Credential checks and throttling are independent of React and session publication. */
export async function authenticateUser(username: string, password: string): Promise<LoginAttempt> {
  if (isGloballyBlocked())
    return { success: false, message: 'تم حظر محاولات تسجيل الدخول مؤقتاً. حاول مرة أخرى لاحقاً' };
  const rate = checkRateLimit(username);
  if (!rate.allowed) {
    const minutes = rate.blockedUntil ? Math.ceil((rate.blockedUntil - Date.now()) / 60000) : 5;
    return { success: false, rateLimitInfo: rate, message: `تم حظر المحاولات. حاول مرة أخرى بعد ${minutes} دقيقة` };
  }
  const user = await getUserByUsername(username);
  if (!user || !passwordMatches(password, user.passwordHash)) {
    recordLoginAttempt(username, false);
    recordGlobalFailedAttempt();
    const current = checkRateLimit(username);
    const message =
      user && current.remainingAttempts > 0 && current.remainingAttempts <= 2
        ? `متبقي ${current.remainingAttempts} محاولات قبل الحظر`
        : undefined;
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: false, rateLimitInfo: current, message, warning: true };
  }
  recordLoginAttempt(username, true);
  resetGlobalFailedAttempts();
  return {
    success: true,
    user: toSessionUser(user),
    mustChangePassword: mustChangeLocalPassword(user),
  };
}
