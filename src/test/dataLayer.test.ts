import 'fake-indexeddb/auto';
import { deleteDB, openDB, unwrap } from 'idb';
import { forceCloseDatabase } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { closeDatabase, DB_NAME, DB_VERSION, getDB } from '../data/database';
import {
  dbAdd,
  dbBulkAdd,
  dbGetAll,
  dbGetById,
  dbGetByIndex,
  dbGetPaginated,
  dbPut,
  dbSoftDelete,
} from '../data/records';
import { BACKUP_STORES, CLOUD_TABLES, NEVER_SYNC_TABLES } from '../data/stores';
import type { Student, Teacher } from '../domain/models';
import { exportAllData, importAllData } from '../services/backupService';
import { newestFirst, paginate } from '../lib/pagination';
import { payrollStudent, payrollTeacher } from './helpers/payroll';

beforeEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});
afterEach(async () => {
  await closeDatabase();
  vi.restoreAllMocks();
});

describe('v7 data connection', () => {
  it('shares one connection-opening promise across concurrent callers', async () => {
    const first = getDB();
    const second = getDB();
    expect(first).toBe(second);
    const connections = await Promise.all([first, second, getDB()]);
    expect(new Set(connections).size).toBe(1);
    expect(connections[0].name).toBe('EduCenterProDB');
    expect(connections[0].version).toBe(7);
    expect(DB_VERSION).toBe(7);
  });

  it('can close/reopen without losing rows', async () => {
    const first = await getDB();
    await dbAdd('students', payrollStudent());
    await closeDatabase();
    expect(await getDB()).not.toBe(first);
    expect(await dbGetById('students', 'student-1')).toMatchObject({ id: 'student-1' });
  });

  it('clears an unexpectedly terminated connection and reopens without losing data', async () => {
    const first = await getDB();
    await dbAdd('students', payrollStudent());
    const native = unwrap(first);
    const closed = new Promise<void>(resolve => native.addEventListener('close', () => resolve(), { once: true }));
    // fake-indexeddb 6.2.5 types name the constructor here; its runtime API takes an instance.
    (forceCloseDatabase as unknown as (database: IDBDatabase) => void)(native);
    await closed;
    expect(await getDB()).not.toBe(first);
    expect(await dbGetById('students', 'student-1')).toBeDefined();
  });

  it('releases its connection when another client requests a version upgrade', async () => {
    const first = await getDB();
    const upgraded = await openDB(DB_NAME, DB_VERSION + 1);
    try {
      expect(upgraded.version).toBe(DB_VERSION + 1);
      expect(() => first.transaction('students')).toThrow();
    } finally { upgraded.close(); }
    // A stale v7 connection is never returned after a different client upgrades the database.
    await expect(getDB()).rejects.toMatchObject({ name: 'VersionError' });
  });

  it('rejects synchronous opening failures as promises and permits retry', async () => {
    const failure = new Error('opening unavailable');
    vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw failure;
    });
    await expect(getDB()).rejects.toBe(failure);
    expect((await getDB()).version).toBe(7);
  });

  it('retains existing data while applying the existing v6→v7 upgrade', async () => {
    const previous = await openDB(DB_NAME, 6, {
      upgrade(db) {
        const students = db.createObjectStore('students', { keyPath: 'id' });
        students.createIndex('by-status', 'status');
        students.createIndex('by-name', 'name');
        students.createIndex('by-parentPhone', 'parentPhone');
        db.createObjectStore('payments', { keyPath: 'id' });
      },
    });
    try {
      await previous.put('students', payrollStudent());
    } finally {
      previous.close();
    }
    const db = await getDB();
    expect(await db.get('students', 'student-1')).toMatchObject({ name: 'طالب تجريبي أول' });
    expect(db.objectStoreNames.contains('payroll')).toBe(true);
    const tx = db.transaction('payments');
    expect(tx.store.indexNames.contains('by-groupId')).toBe(true);
    await tx.done;
  });

  it('keeps local/backup/cloud stores consistent and never syncs local credentials', async () => {
    const db = await getDB();
    expect([...db.objectStoreNames].sort()).toEqual([...BACKUP_STORES, 'settings', 'users'].sort());
    expect([...CLOUD_TABLES].sort()).toEqual([...BACKUP_STORES, 'settings'].sort());
    expect(NEVER_SYNC_TABLES).toEqual(['users']);
    expect(CLOUD_TABLES).not.toContain('users');
    expect(new Set(BACKUP_STORES).size).toBe(BACKUP_STORES.length);
  });
});

describe('record contracts and compatibility', () => {
  it('infers entity types from store names while retaining explicit legacy generics', async () => {
    const students = await dbGetAll('students');
    const teacher = await dbGetById('teachers', 'missing');
    expectTypeOf(students).toEqualTypeOf<Student[]>();
    expectTypeOf(teacher).toEqualTypeOf<Teacher | undefined>();
    expectTypeOf(await dbGetAll<Student>('students')).toEqualTypeOf<Student[]>();
    expect(students).toEqual([]);
    expect(teacher).toBeUndefined();
  });

  it('filters tombstones in all public reads and includes them explicitly in backups', async () => {
    await dbAdd('students', payrollStudent());
    await dbSoftDelete('students', 'student-1', { deletedBy: 'test-user', reason: 'synthetic test' });
    expect(await dbGetAll('students')).toEqual([]);
    expect(await dbGetById('students', 'student-1')).toBeUndefined();
    expect(await dbGetByIndex('students', 'by-status', 'active')).toEqual([]);
    expect(await dbGetPaginated('students', 1, 10)).toEqual({ items: [], total: 0 });
    const deleted = (await dbGetAll('students', { includeDeleted: true }))[0];
    expect(deleted).toMatchObject({ deleted: true, deletedBy: 'test-user', deleteReason: 'synthetic test' });
    const backup = (await exportAllData()) as { students: Student[]; version: number };
    expect(backup.version).toBe(7);
    expect(backup.students).toHaveLength(1);
  });

  it('sorts, filters and paginates using the existing newest-first convention', async () => {
    await dbBulkAdd('students', [
      payrollStudent({ id: 'z-old', createdAt: '2026-01-01', status: 'active' }),
      payrollStudent({ id: 'a-new', createdAt: '2026-03-01', status: 'active' }),
      payrollStudent({ id: 'b-mid', createdAt: '2026-02-01', status: 'active' }),
      payrollStudent({ id: 'c-excluded', createdAt: '2026-04-01', status: 'ended' }),
    ]);
    const page = await dbGetPaginated('students', 2, 1, row => row.status === 'active');
    expect(page.total).toBe(3);
    expect(page.items.map(row => row.id)).toEqual(['b-mid']);
  });

  it('rolls back a bulk write when a later row is invalid', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(dbBulkAdd('students', [payrollStudent(), { name: 'missing key' }])).rejects.toBeDefined();
    expect(await dbGetAll('students')).toEqual([]);
  });

  it('preserves the historic camelCase backup key and does not clear stores omitted by old backups', async () => {
    await dbPut('teachers', payrollTeacher());
    await importAllData({ inventoryTransactions: [{ id: 'test-transaction', amount: 1 }] });
    expect(await dbGetById('teachers', 'teacher-1')).toBeDefined();
    const backup = (await exportAllData({ includeUsers: false })) as Record<string, unknown>;
    expect(backup).not.toHaveProperty('users');
    expect(backup).toHaveProperty('inventoryTransactions', [{ id: 'test-transaction', amount: 1 }]);
    expect(backup).not.toHaveProperty('inventory_transactions');
  });
});

describe('shared pagination', () => {
  it('does not mutate the source and breaks equal-date ties by creation time', () => {
    const rows = [
      { id: 'a', date: '2026-09-02', createdAt: '2026-09-01T10:00' },
      { id: 'b', date: '2026-09-02', createdAt: '2026-09-01T11:00' },
      { id: 'c', date: '2026-09-01', createdAt: '2026-09-01T12:00' },
    ];
    expect(newestFirst(rows).map(r => r.id)).toEqual(['b', 'a', 'c']);
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(paginate(rows, 9, 2)).toEqual({ items: [], total: 3 });
  });

  it('handles empty, non-finite and non-positive page inputs predictably', () => {
    expect(paginate([], 1, 20)).toEqual({ items: [], total: 0 });
    expect(paginate([1, 2, 3], 0, 2)).toEqual({ items: [1, 2], total: 3 });
    expect(paginate([1, 2, 3], NaN, Infinity)).toEqual({ items: [1, 2, 3], total: 3 });
    expect(paginate([1, 2, 3], 1, 0)).toEqual({ items: [1], total: 3 });
  });
});
