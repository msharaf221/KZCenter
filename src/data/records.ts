import { isDeleted } from '../domain/recordState';
import { type PageResult } from '../lib/pagination';
import { getDB } from './database';
import { readAll, readById, readByIndex, readPage } from './readers';
import type { StoreName, StoreRecords } from './schema';
import { writeTransaction } from './transactions';

export interface DbGetAllOptions {
  /** Include tombstones for backups, cloud sync and the recycle bin. */
  includeDeleted?: boolean;
}

// Typed inference for new callers; explicit <T> remains a compatibility escape hatch.
export function dbGetAll<S extends StoreName>(storeName: S, opts?: DbGetAllOptions): Promise<StoreRecords[S][]>;
export function dbGetAll<T>(storeName: StoreName, opts?: DbGetAllOptions): Promise<T[]>;
export async function dbGetAll(storeName: StoreName, opts: DbGetAllOptions = {}): Promise<unknown[]> {
  try {
    return await readAll(storeName, opts);
  } catch (error) {
    // Compatibility: existing read APIs return empty values on storage errors.
    console.error(`dbGetAll(${storeName}) error:`, error);
    return [];
  }
}

export function dbGetById<S extends StoreName>(storeName: S, id: string): Promise<StoreRecords[S] | undefined>;
export function dbGetById<T>(storeName: StoreName, id: string): Promise<T | undefined>;
export async function dbGetById(storeName: StoreName, id: string): Promise<unknown> {
  try {
    return await readById(storeName, id);
  } catch (error) {
    console.error(`dbGetById(${storeName}) error:`, error);
    return undefined;
  }
}

export async function dbAdd<T>(storeName: StoreName, item: T): Promise<void> {
  try {
    await (await getDB()).add(storeName, item as StoreRecords[StoreName]);
  } catch (error) {
    console.error(`dbAdd(${storeName}) error:`, error);
    throw error;
  }
}

export async function dbPut<T>(storeName: StoreName, item: T): Promise<void> {
  try {
    await (await getDB()).put(storeName, item as StoreRecords[StoreName]);
  } catch (error) {
    console.error(`dbPut(${storeName}) error:`, error);
    throw error;
  }
}

export interface SoftDeleteMeta {
  deletedBy?: string;
  reason?: string;
}

export async function dbSoftDelete(storeName: StoreName, id: string, meta: SoftDeleteMeta = {}): Promise<void> {
  await writeTransaction([storeName], async tx => {
    const store = tx.objectStore(storeName);
    const item = await store.get(id);
    if (!item || isDeleted(item)) return;
    const now = new Date().toISOString();
    const tombstone = { ...item, deleted: true, deletedAt: now, deletedBy: meta.deletedBy, deleteReason: meta.reason, updatedAt: now };
    await store.put(tombstone);
  });
}

export async function dbBulkAdd<T>(storeName: StoreName, items: T[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(storeName, 'readwrite');
  try {
    for (const item of items) await tx.store.put(item as StoreRecords[StoreName]);
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
    await tx.done.catch(() => { });
    console.error(`dbBulkAdd(${storeName}) error:`, error);
    throw error;
  }
}

export async function dbClearStore(storeName: StoreName): Promise<void> {
  try {
    await (await getDB()).clear(storeName);
  } catch (error) {
    console.error(`dbClearStore(${storeName}) error:`, error);
    throw error;
  }
}

export function dbGetPaginated<S extends StoreName>(
  storeName: S,
  page: number,
  pageSize: number,
  filterFn?: (item: StoreRecords[S]) => boolean,
): Promise<PageResult<StoreRecords[S]>>;
export function dbGetPaginated<T>(
  storeName: StoreName,
  page: number,
  pageSize: number,
  filterFn?: (item: T) => boolean,
): Promise<PageResult<T>>;
export async function dbGetPaginated<T>(
  storeName: StoreName,
  page: number,
  pageSize: number,
  filterFn?: (item: T) => boolean,
): Promise<PageResult<T>> {
  try {
    return await readPage<T>(storeName, page, pageSize, filterFn);
  } catch (error) {
    console.error(`dbGetPaginated(${storeName}) error:`, error);
    return { items: [], total: 0 };
  }
}

export function dbGetByIndex<S extends StoreName>(
  storeName: S,
  indexName: string,
  value: IDBValidKey,
): Promise<StoreRecords[S][]>;
export function dbGetByIndex<T>(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<T[]>;
export async function dbGetByIndex(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<unknown[]> {
  try {
    return await readByIndex(storeName, indexName, value);
  } catch (error) {
    console.error(`dbGetByIndex(${storeName}, ${indexName}) error:`, error);
    return [];
  }
}
