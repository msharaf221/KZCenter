import { isDeleted } from '../domain/recordState';
import { newestFirst, paginate, type PageResult } from '../lib/pagination';
import { getDB } from './database';
import type { StoreName, StoreRecords } from './schema';

export interface ReadOptions { includeDeleted?: boolean }
export type ReadSnapshot<S extends StoreName> = { [K in S]: StoreRecords[K][] };

/** One readonly transaction: related tables describe the same committed database snapshot. */
export async function readSnapshot<S extends StoreName>(stores: readonly S[], options: ReadOptions = {}): Promise<ReadSnapshot<S>> {
  const names = [...new Set(stores)];
  if (!names.length) return {} as ReadSnapshot<S>;
  const tx = (await getDB()).transaction(names, 'readonly');
  try {
    const entries = await Promise.all(names.map(async name => {
      const rows = await tx.objectStore(name).getAll();
      return [name, options.includeDeleted ? rows : rows.filter(row => !isDeleted(row))] as const;
    }));
    await tx.done;
    return Object.fromEntries(entries) as ReadSnapshot<S>;
  } catch (error) {
    try { tx.abort(); } catch { /* already complete */ }
    await tx.done.catch(() => {});
    throw error;
  }
}

export function readAll<S extends StoreName>(store: S, options?: ReadOptions): Promise<StoreRecords[S][]>;
export function readAll<T>(store: StoreName, options?: ReadOptions): Promise<T[]>;
export async function readAll(store: StoreName, options: ReadOptions = {}): Promise<unknown[]> {
  const rows = await (await getDB()).getAll(store);
  return options.includeDeleted ? rows : rows.filter(row => !isDeleted(row));
}

export function readById<S extends StoreName>(store: S, id: string): Promise<StoreRecords[S] | undefined>;
export function readById<T>(store: StoreName, id: string): Promise<T | undefined>;
export async function readById(store: StoreName, id: string): Promise<unknown> {
  const row = await (await getDB()).get(store, id);
  return isDeleted(row) ? undefined : row;
}

export function readByIndex<S extends StoreName>(store: S, index: string, value: IDBValidKey): Promise<StoreRecords[S][]>;
export function readByIndex<T>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]>;
export async function readByIndex(store: StoreName, index: string, value: IDBValidKey): Promise<unknown[]> {
  return (await (await getDB()).getAllFromIndex(store, index, value)).filter(row => !isDeleted(row));
}

export function readPage<S extends StoreName>(store: S, page: number, size: number, filter?: (row: StoreRecords[S]) => boolean): Promise<PageResult<StoreRecords[S]>>;
export function readPage<T>(store: StoreName, page: number, size: number, filter?: (row: T) => boolean): Promise<PageResult<T>>;
export async function readPage<T>(store: StoreName, page: number, size: number, filter?: (row: T) => boolean): Promise<PageResult<T>> {
  const rows = await readAll<T>(store);
  return paginate(newestFirst((filter ? rows.filter(filter) : rows) as (T & { date?: string; createdAt?: string })[]), page, size);
}
