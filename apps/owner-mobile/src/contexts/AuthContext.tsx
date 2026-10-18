import type { Session } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ownerMembershipStorageKey, ownerSnapshotStorageKey, secureStorage, supabase, supabaseConfigured } from '../lib/supabase';

export interface OwnerMembership {
  tenantId: string;
  role: string;
  offlineVerified: boolean;
}

interface AuthContextValue {
  session: Session | null;
  membership: OwnerMembership | null;
  loading: boolean;
  contextError: string | null;
  configurationMissing: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshAccess: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<OwnerMembership | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [accessRefreshSequence, setAccessRefreshSequence] = useState(0);
  const activeUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      const nextUserId = nextSession?.user.id || null;
      if (nextUserId !== activeUserId.current) {
        activeUserId.current = nextUserId;
        setMembership(null);
        setContextError(null);
        setContextLoading(Boolean(nextUserId));
      }
      setSession(nextSession);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setContextError('تعذّر استرجاع جلسة الدخول الآمنة. سجّل الدخول مرة أخرى.');
      activeUserId.current = data.session?.user.id || null;
      setSession(data.session);
      setAuthLoading(false);
    }).catch(() => {
      if (active) {
        setContextError('تعذّر استرجاع جلسة الدخول الآمنة. سجّل الدخول مرة أخرى.');
        setAuthLoading(false);
      }
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user.id || !supabase) {
      setMembership(null);
      setContextLoading(false);
      return;
    }
    let active = true;
    setContextLoading(true);
    setContextError(null);
    void (async () => {
      try {
        const { data, error, status } = await supabase.rpc('get_my_center_context');
        if (!active) return;
        if (error) {
          const cachedMembership = status === 0 ? await readCachedOwnerMembership(session.user.id) : null;
          if (!active) return;
          if (cachedMembership) {
            setMembership({ ...cachedMembership, offlineVerified: true });
            setContextError(null);
            return;
          }
          setMembership(null);
          setContextError(status === 0
            ? 'لا يوجد اتصال ولا توجد صلاحية مالك محفوظة على هذا الجهاز. اتصل بالإنترنت ثم أعد المحاولة.'
            : 'تعذّر التحقق من صلاحية المالك. تأكد من تطبيق ترحيل صلاحيات تطبيق الموبايل.');
          return;
        }
        const context = Array.isArray(data) ? data[0] : data;
        if (!context?.tenant_id || context.role !== 'owner') {
          setMembership(null);
          setContextError('الحساب ليس مضافًا كمالك للمركز. اطلب ربطه من مسؤول Supabase.');
          void secureStorage.removeItem(ownerMembershipStorageKey(session.user.id)).catch(() => {});
          return;
        }
        const verifiedMembership = { tenantId: context.tenant_id, role: 'owner', offlineVerified: false };
        setMembership(verifiedMembership);
        void secureStorage.setItem(ownerMembershipStorageKey(session.user.id), JSON.stringify({
          userId: session.user.id,
          tenantId: context.tenant_id,
          role: 'owner',
          verifiedAt: new Date().toISOString(),
        })).catch(() => {});
      } catch (cause) {
        if (active) {
          const cachedMembership = isNetworkFailure(cause) ? await readCachedOwnerMembership(session.user.id) : null;
          if (!active) return;
          if (cachedMembership) {
            setMembership({ ...cachedMembership, offlineVerified: true });
            setContextError(null);
          } else {
            setMembership(null);
            setContextError('تعذّر التحقق من صلاحية المالك. افحص الاتصال وحاول مرة أخرى.');
          }
        }
      } finally {
        if (active) setContextLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session?.user.id, accessRefreshSequence]);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'إعدادات الاتصال الآمن غير مكتملة في نسخة التطبيق.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (error.message.toLowerCase().includes('invalid login')) return 'البريد أو كلمة المرور غير صحيحة.';
    return 'تعذّر تسجيل الدخول. راجع بيانات الحساب واتصال الإنترنت.';
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const userId = session?.user.id;
    const snapshotKey = userId && membership?.tenantId ? ownerSnapshotStorageKey(userId, membership.tenantId) : null;
    const membershipKey = userId ? ownerMembershipStorageKey(userId) : null;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    for (const key of [snapshotKey, membershipKey]) {
      if (!key) continue;
      try { await secureStorage.removeItem(key); } catch { /* Sign-out remains local even if Keychain cleanup fails. */ }
    }
    if (error) throw error;
  }, [session?.user.id, membership?.tenantId]);

  const refreshAccess = useCallback(() => {
    setContextError(null);
    setContextLoading(true);
    setAccessRefreshSequence(sequence => sequence + 1);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    membership,
    loading: authLoading || contextLoading || Boolean(session && !membership && !contextError),
    contextError,
    configurationMissing: !supabaseConfigured,
    signIn,
    signOut,
    refreshAccess,
  }), [session, membership, authLoading, contextLoading, contextError, signIn, signOut, refreshAccess]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

const OFFLINE_MEMBERSHIP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function readCachedOwnerMembership(userId: string): Promise<OwnerMembership | null> {
  try {
    const serialized = await secureStorage.getItem(ownerMembershipStorageKey(userId));
    if (!serialized) return null;
    const cached: unknown = JSON.parse(serialized);
    if (!cached || typeof cached !== 'object') return null;
    const value = cached as { userId?: unknown; tenantId?: unknown; role?: unknown; verifiedAt?: unknown };
    const verifiedAt = typeof value.verifiedAt === 'string' ? Date.parse(value.verifiedAt) : NaN;
    const age = Date.now() - verifiedAt;
    if (
      value.userId !== userId ||
      typeof value.tenantId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.tenantId) ||
      value.role !== 'owner' ||
      !Number.isFinite(verifiedAt) ||
      age < -5 * 60 * 1000 ||
      age > OFFLINE_MEMBERSHIP_MAX_AGE_MS
    ) return null;
    return { tenantId: value.tenantId, role: 'owner', offlineVerified: true };
  } catch {
    return null;
  }
}

function isNetworkFailure(cause: unknown): boolean {
  if (cause instanceof TypeError) return true;
  return cause instanceof Error && /network|fetch|offline|timeout|connection/i.test(cause.message);
}
