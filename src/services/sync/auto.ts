import { getSupabaseConfigured } from '../../data/cloud/client';
import {
  getSyncOutboxCount,
  readSyncOutboxBatch,
  subscribeSyncOutbox,
} from '../../data/syncOutbox';
import { flushSyncOutbox, type OutboxSyncReport } from './outbox';

export type AutoSyncPhase = 'disabled' | 'idle' | 'syncing' | 'online' | 'offline' | 'error';
export interface AutoSyncStatus {
  phase: AutoSyncPhase;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const LAST_SYNC_KEY = 'educenter_auto_sync_last_success';
const POLL_INTERVAL_MS = 20_000;
const DEBOUNCE_MS = 450;
const listeners = new Set<(status: AutoSyncStatus) => void>();
let status: AutoSyncStatus = {
  phase: 'idle',
  pending: 0,
  lastSyncedAt: readLastSyncedAt(),
  lastError: null,
};
let started = false;
let scheduled: ReturnType<typeof setTimeout> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;
let unsubscribeOutbox: (() => void) | null = null;
let running: Promise<void> | null = null;

function readLastSyncedAt(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function publish(patch: Partial<AutoSyncStatus>): void {
  status = { ...status, ...patch };
  for (const listener of [...listeners]) {
    try { listener({ ...status }); } catch (error) { console.error('Auto-sync status listener failed:', error); }
  }
}

export function getAutoSyncStatus(): AutoSyncStatus {
  return { ...status };
}

export function subscribeAutoSyncStatus(listener: (status: AutoSyncStatus) => void): () => void {
  listeners.add(listener);
  listener({ ...status });
  return () => listeners.delete(listener);
}

/** Start once in the desktop renderer. Every writer shares the durable IndexedDB outbox. */
export function startAutoSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (started) return stopAutoSync;
  started = true;

  const schedule = (delay = DEBOUNCE_MS) => {
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      scheduled = null;
      void runSync();
    }, delay);
  };
  const handleOnline = () => {
    publish({ phase: 'idle', lastError: null });
    schedule(0);
  };
  const handleOffline = () => publish({ phase: 'offline' });
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') schedule(0);
  };

  unsubscribeOutbox = subscribeSyncOutbox(() => schedule());
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
  poller = setInterval(() => schedule(0), POLL_INTERVAL_MS);

  if (!getSupabaseConfigured()) publish({ phase: 'disabled', lastError: null });
  else if (!navigator.onLine) publish({ phase: 'offline' });
  else schedule(0);
  void refreshPending();

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibility);
    stopAutoSync();
  };
}

export function stopAutoSync(): void {
  if (!started) return;
  started = false;
  if (scheduled) clearTimeout(scheduled);
  if (poller) clearInterval(poller);
  scheduled = null;
  poller = null;
  unsubscribeOutbox?.();
  unsubscribeOutbox = null;
  running = null;
}

async function refreshPending(): Promise<void> {
  try { publish({ pending: await getSyncOutboxCount() }); }
  catch (error) { publish({ lastError: String(error) }); }
}

async function runSync(): Promise<void> {
  if (running) return running;
  if (!getSupabaseConfigured()) {
    publish({ phase: 'disabled', pending: await getSyncOutboxCount().catch(() => status.pending) });
    return;
  }
  if (!navigator.onLine) {
    publish({ phase: 'offline', pending: await getSyncOutboxCount().catch(() => status.pending) });
    return;
  }

  const work = runSyncOnce().finally(() => {
    if (running === work) running = null;
  });
  running = work;
  return work;
}

async function runSyncOnce(): Promise<void> {
  publish({ phase: 'syncing', lastError: null });
  let report: OutboxSyncReport;
  try {
    report = await flushSyncOutbox();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    publish({ phase: 'error', pending: await getSyncOutboxCount().catch(() => status.pending), lastError: message });
    return;
  }

  const pending = await getSyncOutboxCount().catch(() => report.pending);
  if (report.synchronized > 0) {
    const now = new Date().toISOString();
    try { localStorage.setItem(LAST_SYNC_KEY, now); } catch { /* status still updates in memory */ }
    status = { ...status, lastSyncedAt: now };
  }
  publish({
    phase: report.ok ? 'online' : 'error',
    pending,
    lastError: report.errors[0] || null,
  });

  // Drain a larger offline backlog in bounded requests without waiting for the poll interval.
  if (pending > 0 && report.synchronized > 0) {
    const nextDue = await readSyncOutboxBatch(1).catch(() => []);
    if (nextDue.length) {
      if (scheduled) clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        scheduled = null;
        void runSync();
      }, 100);
    }
  }
}
