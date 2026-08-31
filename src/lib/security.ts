/**
 * Security utilities
 * أدوات الأمان - Rate limiting, session expiry, audit log
 */

// ==================== RATE LIMITING ====================

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

// Persist to localStorage so rate limiting survives page refresh
const RATE_LIMIT_KEY = 'educenter_rate_limit';
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes
const WINDOW_DURATION = 15 * 60 * 1000; // 15 minutes

function loadRateLimitMap(): Map<string, RateLimitEntry> {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, RateLimitEntry>;
    const now = Date.now();
    // Purge expired entries so localStorage doesn't grow unbounded
    for (const [key, entry] of Object.entries(obj)) {
      const windowExpired = now - entry.firstAttempt > WINDOW_DURATION;
      const blockExpired = !entry.blockedUntil || now >= entry.blockedUntil;
      if (windowExpired && blockExpired) {
        delete obj[key];
      }
    }
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(obj));
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveRateLimitMap(map: Map<string, RateLimitEntry>): void {
  try {
    const obj: Record<string, RateLimitEntry> = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(obj));
  } catch {
    // localStorage full or unavailable — degrade gracefully
  }
}

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remainingAttempts: number;
  blockedUntil?: number;
} {
  const now = Date.now();
  const map = loadRateLimitMap();
  const entry = map.get(identifier);

  if (!entry) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if blocked
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return {
      allowed: false,
      remainingAttempts: 0,
      blockedUntil: entry.blockedUntil,
    };
  }

  // Reset if window expired
  if (now - entry.firstAttempt > WINDOW_DURATION) {
    map.delete(identifier);
    saveRateLimitMap(map);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  const remaining = MAX_ATTEMPTS - entry.count;
  return { allowed: remaining > 0, remainingAttempts: Math.max(0, remaining) };
}

export function recordLoginAttempt(identifier: string, success: boolean): void {
  const now = Date.now();
  const map = loadRateLimitMap();
  const entry = map.get(identifier);

  if (success) {
    map.delete(identifier);
    saveRateLimitMap(map);
    return;
  }

  if (!entry) {
    map.set(identifier, { count: 1, firstAttempt: now });
    saveRateLimitMap(map);
    return;
  }

  // Reset if window expired
  if (now - entry.firstAttempt > WINDOW_DURATION) {
    map.set(identifier, { count: 1, firstAttempt: now });
    saveRateLimitMap(map);
    return;
  }

  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_DURATION;
  }
  map.set(identifier, entry);
  saveRateLimitMap(map);
}

// ==================== GLOBAL RATE LIMITING ====================
// يعمل كطبقة حماية إضافية ضد هجمات "تخمين أسماء المستخدمين" (username spraying)
// حيث يتتبع إجمالي المحاولات الفاشلة بغض النظر عن اسم المستخدم.

const GLOBAL_FAILED_KEY = 'educenter_global_failed';
const GLOBAL_MAX_ATTEMPTS = 15;
const GLOBAL_WINDOW = 10 * 60 * 1000; // 10 minutes

interface GlobalFailedState {
  count: number;
  windowStart: number;
}

function loadGlobalFailed(): GlobalFailedState {
  try {
    const raw = localStorage.getItem(GLOBAL_FAILED_KEY);
    if (!raw) return { count: 0, windowStart: 0 };
    return JSON.parse(raw) as GlobalFailedState;
  } catch {
    return { count: 0, windowStart: 0 };
  }
}

function saveGlobalFailed(state: GlobalFailedState): void {
  try {
    localStorage.setItem(GLOBAL_FAILED_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function recordGlobalFailedAttempt(): void {
  const now = Date.now();
  const state = loadGlobalFailed();
  if (!state.windowStart || now - state.windowStart > GLOBAL_WINDOW) {
    state.windowStart = now;
    state.count = 1;
  } else {
    state.count++;
  }
  saveGlobalFailed(state);
}

export function isGloballyBlocked(): boolean {
  const now = Date.now();
  const state = loadGlobalFailed();
  if (!state.windowStart) return false;
  if (now - state.windowStart > GLOBAL_WINDOW) return false;
  return state.count >= GLOBAL_MAX_ATTEMPTS;
}

export function resetGlobalFailedAttempts(): void {
  localStorage.removeItem(GLOBAL_FAILED_KEY);
}

// ==================== SESSION MANAGEMENT ====================

const SESSION_KEY = 'educenter_session';
const SESSION_TIMESTAMP_KEY = 'educenter_session_ts';
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours

export function getSessionTimestamp(): number {
  const ts = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
  return ts ? parseInt(ts, 10) : 0;
}

export function setSessionTimestamp(): void {
  sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
}

export function isSessionExpired(): boolean {
  const ts = getSessionTimestamp();
  if (!ts) return true;
  return Date.now() - ts > SESSION_MAX_AGE;
}

export function refreshSession(): void {
  sessionStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_TIMESTAMP_KEY);
}

// ==================== AUDIT LOG ====================

export interface AuditEntry {
  id: string;
  userId: string;
  username: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'import' | 'backup';
  entity: string;
  entityId?: string;
  details?: string;
  timestamp: string;
  ip?: string;
}

const AUDIT_STORAGE_KEY = 'educenter_audit_log';
const MAX_AUDIT_ENTRIES = 500;

export function getAuditLog(): AuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  const log = getAuditLog();
  const newEntry: AuditEntry = {
    ...entry,
    id: crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).substring(2),
    timestamp: new Date().toISOString(),
  };
  log.unshift(newEntry);
  if (log.length > MAX_AUDIT_ENTRIES) log.pop();
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(log));
  window.dispatchEvent(new Event('audit_log_updated'));
}

export function clearAuditLog(): void {
  localStorage.setItem(AUDIT_STORAGE_KEY, '[]');
  window.dispatchEvent(new Event('audit_log_updated'));
}

// ==================== PASSWORD VALIDATION ====================

export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  suggestions: string[];
}

export function checkPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8) score++;
  else suggestions.push('استخدم 8 أحرف على الأقل');

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else suggestions.push('اخلط بين الحروف الكبيرة والصغيرة');

  if (/\d/.test(password)) score++;
  else suggestions.push('أضف أرقام');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else suggestions.push('أضف رموز خاصة (!@#$%)');

  const labels = ['ضعيفة جداً', 'ضعيفة', 'متوسطة', 'قوية', 'قوية جداً'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

  return {
    score,
    label: labels[score],
    color: colors[score],
    suggestions,
  };
}

// ==================== INPUT SANITIZATION ====================

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeInput(result[key] as string);
    }
  }
  return result;
}
