import type { IDBPTransaction } from 'idb';
import { isDeleted } from '../domain/recordState';
import { getDB } from './database';
import type { ReadOptions, ReadSnapshot } from './readers';
import type { DatabaseSchema, StoreName } from './schema';

export type WriteTransaction<S extends StoreName> = IDBPTransaction<DatabaseSchema, S[], 'readwrite'>;

/** Only await IDB requests in work; network, timers and UI belong outside the transaction. */
export async function writeTransaction<S extends StoreName, T>(
  stores: S[],
  work: (tx: WriteTransaction<S>) => Promise<T>,
): Promise<T> {
  const tx = (await getDB()).transaction(stores, 'readwrite');
  try {
    const result = await work(tx);
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already finished/aborted */
    }
    await tx.done.catch(() => { });
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
