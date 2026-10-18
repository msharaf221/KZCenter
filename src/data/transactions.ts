import type { IDBPTransaction } from 'idb';
import { isDeleted } from '../domain/recordState';
import { getDB } from './database';
import { notifySyncOutboxChanged, syncOutboxKey, syncRowId, type SyncOutboxEntry } from './syncOutbox';
import { CLOUD_TABLES } from './stores';
import type { ReadOptions, ReadSnapshot } from './readers';
import type { DatabaseSchema, StoreName } from './schema';
import type { TableName } from './stores';

export type WriteTransaction<S extends StoreName> = IDBPTransaction<DatabaseSchema, S[], 'readwrite'>;
type RuntimeWriteTransaction = IDBPTransaction<DatabaseSchema, StoreName[], 'readwrite'>;
type RuntimeObjectStore = ReturnType<RuntimeWriteTransaction['objectStore']>;

export interface WriteTransactionOptions {
  /** Remote pulls must not create an upload echo in the local outbox. */
  trackCloudChanges?: boolean;
}

function isCloudTable(store: StoreName): store is TableName {
  return CLOUD_TABLES.includes(store as TableName);
}

/**
 * Intercept writes to cloud-owned object stores so the row change and its durable,
 * metadata-only outbox entry commit or roll back in the same IndexedDB transaction.
 */
function trackTransaction<S extends StoreName>(
  tx: RuntimeWriteTransaction,
  requestedStores: readonly S[],
  onTrackedWrite: () => void,
): WriteTransaction<S> {
  const wrappedStores = new Map<StoreName, unknown>();
  const outbox = tx.objectStore('sync_outbox');

  const wrapStore = (name: StoreName): RuntimeObjectStore => {
    if (!isCloudTable(name)) return tx.objectStore(name) as RuntimeObjectStore;
    const cached = wrappedStores.get(name);
    if (cached) return cached as RuntimeObjectStore;
    const raw = tx.objectStore(name) as RuntimeObjectStore;
    const wrapped = new Proxy(raw, {
      get(target, property) {
        if (property === 'put' || property === 'add') {
          return async (...args: unknown[]) => {
            const value = args[0] as { id?: string | number } | undefined;
            const rowId = syncRowId(name, value as never);
            const result = await Reflect.apply(Reflect.get(target, property, target) as (...items: unknown[]) => unknown, target, args);
            await enqueue(name, rowId, 'upsert');
            onTrackedWrite();
            return result;
          };
        }
        if (property === 'delete') {
          return async (key: IDBValidKey) => {
            const result = await Reflect.apply(Reflect.get(target, property, target) as (value: IDBValidKey) => unknown, target, [key]);
            await enqueue(name, String(key), 'delete');
            onTrackedWrite();
            return result;
          };
        }
        if (property === 'clear') {
          return async () => {
            const rows = await target.getAll();
            const result = await target.clear();
            await result;
            for (const row of rows) {
              const rowId = syncRowId(name, row as never);
              await enqueue(name, rowId, 'delete');
            }
            if (rows.length) onTrackedWrite();
            return result;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    wrappedStores.set(name, wrapped);
    return wrapped;
  };

  async function enqueue(table: TableName, rowId: string, operation: SyncOutboxEntry['operation']) {
    const id = syncOutboxKey(table, rowId);
    const previous = await outbox.get(id);
    const now = new Date().toISOString();
    const entry: SyncOutboxEntry = {
      id,
      table,
      rowId,
      operation,
      version: (previous?.version ?? 0) + 1,
      updatedAt: now,
      attempts: 0,
      nextAttemptAt: now,
    };
    await outbox.put(entry);
  }

  return new Proxy(tx, {
    get(target, property) {
      if (property === 'objectStore') {
        return (name: StoreName) => wrapStore(name);
      }
      if (property === 'store' && requestedStores.length === 1) {
        // The internal outbox store is added to the native transaction. Preserve
        // idb's convenient `tx.store` API for callers that requested one store.
        return wrapStore(requestedStores[0]);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as WriteTransaction<S>;
}

/** Only await IndexedDB requests in work; network, timers and UI belong outside the transaction. */
export async function writeTransaction<S extends StoreName, T>(
  stores: S[],
  work: (tx: WriteTransaction<S>) => Promise<T>,
  options: WriteTransactionOptions = {},
): Promise<T> {
  const trackCloudChanges = options.trackCloudChanges !== false && stores.some(isCloudTable);
  const nativeStores = [...new Set<StoreName>([
    ...stores,
    ...(trackCloudChanges ? ['sync_outbox' as const] : []),
  ])];
  const tx = (await getDB()).transaction(nativeStores, 'readwrite');
  let trackedWrite = false;
  const workTx = trackCloudChanges
    ? trackTransaction(tx as RuntimeWriteTransaction, stores, () => { trackedWrite = true; })
    : tx as WriteTransaction<S>;
  try {
    const result = await work(workTx);
    await tx.done;
    if (trackedWrite) notifySyncOutboxChanged();
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already finished/aborted */
    }
    await tx.done.catch(() => {});
    throw error;
  }
}

/** Read the caller's in-progress transaction; never open or finish a nested transaction. */
export async function transactionSnapshot<S extends StoreName>(tx: WriteTransaction<S>, stores: readonly S[], options: ReadOptions = {}): Promise<ReadSnapshot<S>> {
  const entries = await Promise.all(stores.map(async name => {
    const rows = await tx.objectStore(name).getAll();
    return [name, options.includeDeleted ? rows : rows.filter(row => !isDeleted(row))] as const;
  }));
  return Object.fromEntries(entries) as ReadSnapshot<S>;
}
