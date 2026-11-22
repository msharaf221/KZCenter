/** Durable, metadata-only journal of local rows waiting for cloud upload. */
import type { StoreRecords } from './schema';
import { getDB } from './database';
import type { TableName } from './stores';

export type SyncOutboxOperation = 'upsert' | 'delete';

export interface SyncOutboxEntry {
  /** Stable per entity so repeated local edits coalesce to the newest state. */
  id: string;
  table: TableName;
  rowId: string;
  operation: SyncOutboxOperation;
  version: number;
  updatedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
}

export type SyncOutboxListener = () => void;
const listeners = new Set<SyncOutboxListener>();

export function subscribeSyncOutbox(listener: SyncOutboxListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notify service coordinators only after the IndexedDB transaction commits. */
export function notifySyncOutboxChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.error('Sync outbox listener failed:', error);
    }
  }
}

export function syncOutboxKey(table: TableName, rowId: string): string {
  return `${table}:${encodeURIComponent(rowId)}`;
}

export function syncRowId<S extends TableName>(table: S, row: StoreRecords[S]): string {
  const id = (row as { id?: string | number }).id;
  if (id === undefined || id === null || String(id).length === 0) {
    throw new Error(`Cannot enqueue ${table}: row id is missing`);
  }
  return String(id);
}

/** Read only due entries; their rows are fetched from the business stores at flush time. */
export async function readSyncOutboxBatch(limit = 100): Promise<SyncOutboxEntry[]> {
  const db = await getDB();
  const tx = db.transaction('sync_outbox', 'readonly');
  try {
    const rows = await tx.store.index('by-nextAttemptAt').getAll(IDBKeyRange.upperBound(new Date().toISOString()), limit);
    await tx.done;
    return rows.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  } catch (error) {
    try { tx.abort(); } catch { /* already completed */ }
    await tx.done.catch(() => {});
    throw error;
  }
}

export async function getSyncOutboxCount(): Promise<number> {
  const db = await getDB();
  return db.count('sync_outbox');
}

export async function readRowForSync(table: TableName, rowId: string): Promise<StoreRecords[TableName] | undefined> {
  return (await getDB()).get(table, rowId) as Promise<StoreRecords[TableName] | undefined>;
}

/** Delete an entry only if it is still the revision that was sent to Supabase. */
export async function acknowledgeSyncOutbox(id: string, version: number): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction('sync_outbox', 'readwrite');
  try {
    const current = await tx.store.get(id);
    const acknowledged = current?.version === version;
    if (acknowledged) await tx.store.delete(id);
    await tx.done;
    return acknowledged;
  } catch (error) {
    try { tx.abort(); } catch { /* already completed */ }
    await tx.done.catch(() => {});
    throw error;
  }
}

export async function deferSyncOutbox(id: string, version: number, error: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('sync_outbox', 'readwrite');
  try {
    const current = await tx.store.get(id);
    if (current?.version === version) {
      const attempts = current.attempts + 1;
      const delayMs = Math.min(1000 * 2 ** Math.min(attempts - 1, 8), 5 * 60 * 1000);
      await tx.store.put({
        ...current,
        attempts,
        nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
        lastError: error.slice(0, 500),
      });
    }
    await tx.done;
  } catch (failure) {
    try { tx.abort(); } catch { /* already completed */ }
    await tx.done.catch(() => {});
    throw failure;
  }
}
