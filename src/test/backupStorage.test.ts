import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as database from '../data/database';
import { readAll, readById } from '../data/readers';
import { dbPut } from '../data/records';
import { planBackupImport } from '../domain/backup/format';
import { getSettings, setSettingsCache } from '../lib/settings';
import { exportAllData, importAllData } from '../services/backupService';
import { payrollStudent, payrollTeacher } from './helpers/payroll';

beforeEach(async () => {
  const db = await database.getDB();
  for (const store of db.objectStoreNames) await db.clear(store);
  await dbPut('students', payrollStudent());
  await dbPut('teachers', payrollTeacher());
  await dbPut('settings', { id: 'main', centerName: 'Original synthetic center', sessionsPerMonth: 12 });
  setSettingsCache(null);
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });

describe('all-or-nothing local restores', () => {
  it.each([
    { students: [] , teachers: [{ name: 'no key' }] },
    { students: [], teachers: [null] }, { students: [], teachers: [{ id: '' }] },
    { students: [], teachers: 'wrong shape' }, { students: [], teachers: null },
    { students: [], settings: { id: 'wrong' } }, { students: [], version: 8 },
  ])('validates every included container/key before touching the database: %j', async input => {
    const open = vi.spyOn(database, 'getDB');
    await expect(importAllData(input)).rejects.toBeDefined();
    expect(open).not.toHaveBeenCalled();
    expect(await readById('students', 'student-1')).toBeDefined();
    expect(await readById('teachers', 'teacher-1')).toBeDefined();
  });
  it('aborts earlier store replacements when a later put cannot be cloned', async () => {
    const settings = await getSettings();
    await expect(importAllData({
      students: [payrollStudent({ id: 'replacement' })],
      teachers: [{ id: 'not-cloneable', unexpected: () => 'synthetic' }],
      settings: { id: 'main', sessionsPerMonth: 2 },
    })).rejects.toBeDefined();
    expect((await readAll('students')).map(row => row.id)).toEqual(['student-1']);
    expect((await readAll('teachers')).map(row => row.id)).toEqual(['teacher-1']);
    expect((await readById('settings', 'main'))?.sessionsPerMonth).toBe(12);
    expect(await getSettings()).toEqual(settings);
  });
  it('restores included stores/settings together and invalidates cached billing configuration', async () => {
    expect((await getSettings()).sessionsPerMonth).toBe(12);
    await importAllData({ students: [payrollStudent({ id: 'replacement' })], teachers: [], settings: { id: 'main', sessionsPerMonth: 2 } });
    expect((await readAll('students')).map(row => row.id)).toEqual(['replacement']);
    expect(await readAll('teachers')).toEqual([]);
    expect((await getSettings()).sessionsPerMonth).toBe(2);
  });
  it('preserves omitted stores, optional users, minimal legacy rows and both transaction aliases', async () => {
    await dbPut('users', { id: 'synthetic-local-user', passwordHash: 'synthetic-test-hash' });
    await importAllData({ inventoryTransactions: [{ id: 'legacy', amount: 1 }] });
    expect(await readAll('inventory_transactions')).toEqual([{ id: 'legacy', amount: 1 }]);
    expect(await readById('students', 'student-1')).toBeDefined();
    expect(await readAll('users')).toHaveLength(1);
    await importAllData({ inventory_transactions: [{ id: 'snake-case' }], users: [] });
    expect(await readAll('inventory_transactions')).toEqual([{ id: 'snake-case' }]);
    expect(await readAll('users')).toEqual([]);
  });
  it('retains legacy last-row-wins puts and requires core tables only for file-level validation', async () => {
    await importAllData({ students: [{ id: 'same', name: 'first' }, { id: 'same', name: 'last' }] });
    expect(await readAll('students')).toEqual([{ id: 'same', name: 'last' }]);
    expect(() => planBackupImport({ students: [] }, ['students'], 7, true)).toThrow();
    expect(() => planBackupImport({ students: [], teachers: [], groups: [], courses: [] }, ['students'], 7, true)).not.toThrow();
  });
});

describe('backup read snapshots', () => {
  it('exports tombstones and legacy keys while omitting local credentials on request', async () => {
    await dbPut('students', payrollStudent({ deleted: true }));
    await dbPut('users', { id: 'synthetic-local-user', passwordHash: 'synthetic-test-hash' });
    const local = await exportAllData() as Record<string, unknown>;
    expect(local.students).toEqual([expect.objectContaining({ deleted: true })]);
    expect(local.users).toHaveLength(1);
    const cloud = await exportAllData({ includeUsers: false }) as Record<string, unknown>;
    expect(cloud.version).toBe(7);
    expect(cloud.includeUsers).toBe(false);
    expect(cloud).not.toHaveProperty('users');
    expect(cloud).toHaveProperty('inventoryTransactions');
    expect(cloud).not.toHaveProperty('inventory_transactions');
  });
  it('cannot mix stores from before and after an overlapping write transaction', async () => {
    const db = await database.getDB();
    const getAll = IDBObjectStore.prototype.getAll;
    let concurrentWrite: Promise<void> | undefined;
    vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, query, count) {
      const request = getAll.call(this, query, count);
      if (this.name === 'students' && !concurrentWrite) {
        concurrentWrite = (async () => {
          const tx = db.transaction(['students', 'teachers'], 'readwrite');
          await tx.objectStore('students').put(payrollStudent({ name: 'new synthetic student' }));
          await tx.objectStore('teachers').put(payrollTeacher({ name: 'new synthetic teacher' }));
          await tx.done;
        })();
      }
      return request;
    });
    const snapshot = await exportAllData() as { students: { name: string }[]; teachers: { name: string }[] };
    await concurrentWrite;
    expect(snapshot.students[0].name).toBe(payrollStudent().name);
    expect(snapshot.teachers[0].name).toBe(payrollTeacher().name);
    expect((await readById('teachers', 'teacher-1'))?.name).toBe('new synthetic teacher');
  });
  it('rejects a failed export instead of returning a successful empty archive', async () => {
    vi.spyOn(database, 'getDB').mockRejectedValue(new Error('Synthetic read failure'));
    await expect(exportAllData()).rejects.toThrow('Synthetic read failure');
  });
});
