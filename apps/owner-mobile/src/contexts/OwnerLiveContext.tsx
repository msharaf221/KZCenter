import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren, createContext, useContext } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { loadOwnerSnapshot, type OwnerSnapshot } from '../lib/owner-data';
import { ownerSnapshotStorageKey, secureStorage, supabase } from '../lib/supabase';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'error';

interface OwnerLiveContextValue {
  snapshot: OwnerSnapshot | null;
  error: string | null;
  status: LiveStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const OwnerLiveContext = createContext<OwnerLiveContextValue | null>(null);

export function OwnerLiveProvider({ children }: PropsWithChildren) {
  const { membership, session } = useAuth();
  const [snapshot, setSnapshot] = useState<OwnerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const refreshSequence = useRef(0);
  const appState = useRef<string | null>(AppState.currentState);
  const cacheKey = useMemo(() => session?.user.id && membership?.tenantId
    ? ownerSnapshotStorageKey(session.user.id, membership.tenantId)
    : null, [session?.user.id, membership?.tenantId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!membership?.tenantId) return;
    const sequence = ++refreshSequence.current;
    setRefreshing(true);
    try {
      const next = await loadOwnerSnapshot(membership.tenantId);
      if (!mounted.current || sequence !== refreshSequence.current) return;
      const serverSnapshot: OwnerSnapshot = { ...next, source: 'server' };
      setSnapshot(serverSnapshot);
      setError(null);
      if (cacheKey) void secureStorage.setItem(cacheKey, JSON.stringify(serverSnapshot)).catch(() => {});
    } catch (cause) {
      if (!mounted.current || sequence !== refreshSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'تعذّر تحديث بيانات المركز.');
      setStatus(previous => previous === 'live' ? 'live' : 'error');
    } finally {
      if (mounted.current && sequence === refreshSequence.current) setRefreshing(false);
    }
  }, [membership?.tenantId, cacheKey]);

  useEffect(() => {
    if (!membership?.tenantId || !session?.user.id || !supabase) {
      setStatus('offline');
      setSnapshot(null);
      return;
    }

    let active = true;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    setStatus('connecting');
    const cacheReadSequence = refreshSequence.current;
    void (async () => {
      try {
        if (cacheKey) {
          const serialized = await secureStorage.getItem(cacheKey);
          if (active && serialized && refreshSequence.current === cacheReadSequence) {
            const cached: unknown = JSON.parse(serialized);
            if (isValidOwnerSnapshot(cached)) {
              setSnapshot({
                ...cached,
                metrics: { ...cached.metrics, byCollector: cached.metrics.byCollector || [] },
                source: 'cache',
              });
            }
          }
        }
      } catch {
        // A corrupt or unavailable local cache must never block a live refresh.
      }
      if (active) void refresh();
    })();

    const channel = supabase.channel(`owner-live-${membership.tenantId}-${session.user.id}`);
    const watchedTables = ['payments', 'expenses', 'refunds', 'students', 'attendance', 'audit_logs'];
    for (const table of watchedTables) {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `tenant_id=eq.${membership.tenantId}`,
      }, () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          void refresh();
        }, 450);
      });
    }
    channel.subscribe((state) => {
      if (!active) return;
      if (state === 'SUBSCRIBED') {
        setStatus('live');
        setError(null);
        // Re-fetch after every connection so events missed while offline are recovered.
        void refresh();
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        setStatus('reconnecting');
        setError('انقطع الاتصال المباشر؛ سيُعاد الاتصال تلقائيًا. اسحب للتحديث عند الحاجة.');
      } else if (state === 'CLOSED') {
        setStatus('offline');
      }
    });

    const appStateListener = AppState.addEventListener('change', nextState => {
      const wasBackgrounded = /inactive|background/.test(appState.current || '');
      appState.current = nextState;
      if (wasBackgrounded && nextState === 'active') {
        setStatus('reconnecting');
        void refresh();
      }
    });

    return () => {
      active = false;
      refreshSequence.current += 1;
      if (reloadTimer) clearTimeout(reloadTimer);
      appStateListener.remove();
      void supabase?.removeChannel(channel);
    };
  }, [membership?.tenantId, session?.user.id, refresh, cacheKey]);

  const value = useMemo<OwnerLiveContextValue>(() => ({ snapshot, error, status, refreshing, refresh }), [snapshot, error, status, refreshing, refresh]);
  return <OwnerLiveContext.Provider value={value}>{children}</OwnerLiveContext.Provider>;
}

export function useOwnerLiveData(): OwnerLiveContextValue {
  const value = useContext(OwnerLiveContext);
  if (!value) throw new Error('useOwnerLiveData must be used inside OwnerLiveProvider');
  return value;
}

function isValidOwnerSnapshot(value: unknown): value is OwnerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OwnerSnapshot>;
  const metrics = candidate.metrics;
  return Boolean(
    typeof candidate.refreshedAt === 'string' &&
    Array.isArray(candidate.activity) &&
    candidate.activity.every((item) => Boolean(
      item && typeof item.id === 'string' && typeof item.username === 'string' &&
      typeof item.action === 'string' && typeof item.entity === 'string' &&
      typeof item.timestamp === 'string' && (item.details === undefined || typeof item.details === 'string')
    )) &&
    metrics &&
    typeof metrics.centerName === 'string' &&
    typeof metrics.currency === 'string' &&
    Number.isFinite(metrics.collected) &&
    Number.isFinite(metrics.refunds) &&
    Number.isFinite(metrics.expenses) &&
    Number.isFinite(metrics.net) &&
    Number.isFinite(metrics.paymentCount) &&
    Number.isFinite(metrics.newStudents) &&
    Number.isFinite(metrics.attendanceCount) &&
    Number.isFinite(metrics.absentCount) &&
    metrics.byMethod && typeof metrics.byMethod === 'object' &&
    Object.values(metrics.byMethod).every(Number.isFinite) &&
    (metrics.byCollector === undefined || (
      Array.isArray(metrics.byCollector) &&
      metrics.byCollector.every(collector => Boolean(
        collector && typeof collector.id === 'string' && typeof collector.name === 'string' &&
        Number.isFinite(collector.amount) && Number.isFinite(collector.paymentCount)
      ))
    ))
  );
}
