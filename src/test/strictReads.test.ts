import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import * as database from '../data/database';
import { readAll, readById, readByIndex, readPage, readSnapshot } from '../data/readers';
import { dbGetAll, dbGetById, dbGetByIndex, dbGetPaginated, dbPut } from '../data/records';
import type { Student, Teacher } from '../domain/models';
import { getSettings, peekSettings, setSettingsCache } from '../lib/settings';
import { getStudentRefunds } from '../services/balanceService';
import { loadReportData } from '../services/queries/reports';
import { loadDailyReportData } from '../services/queries/dailyReports';
import { payrollStudent, payrollTeacher } from './helpers/payroll';

beforeEach(async () => {
  const db = await database.getDB();
  for (const store of db.objectStoreNames) await db.clear(store);
  setSettingsCache(null);
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });

const failure = new Error('Synthetic storage failure');
describe('strict production reads and legacy fallbacks', () => {
  it.each([
    ['all', () => readAll('students')], ['id', () => readById('students', 's1')],
    ['index', () => readByIndex('students', 'by-status', 'active')], ['page', () => readPage('students', 1, 20)],
    ['snapshot', () => readSnapshot(['students', 'teachers'])], ['report', loadReportData],
    ['daily report', () => loadDailyReportData({ selectedDate: '2026-09-24' })],
    ['refund balance input', () => getStudentRefunds('s1')],
  ])('propagates %s read failures instead of fabricating empty data', async (_name, load) => {
    vi.spyOn(database, 'getDB').mockRejectedValue(failure);
    await expect(load()).rejects.toBe(failure);
  });
  it('retains all legacy empty-result fallback contracts', async () => {
    vi.spyOn(database, 'getDB').mockRejectedValue(failure);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await dbGetAll('students')).toEqual([]);
    expect(await dbGetById('students', 's1')).toBeUndefined();
    expect(await dbGetByIndex('students', 'by-status', 'active')).toEqual([]);
    expect(await dbGetPaginated('students', 1, 20)).toEqual({ items: [], total: 0 });
  });
  it('infers store types and honors tombstones, including explicit snapshot exports', async () => {
    await dbPut('students', payrollStudent({ deleted: true }));
    await dbPut('teachers', payrollTeacher());
    const rows = await readSnapshot(['students', 'teachers']);
    expectTypeOf(rows.students).toEqualTypeOf<Student[]>();
    expectTypeOf(rows.teachers).toEqualTypeOf<Teacher[]>();
    expectTypeOf(await readAll('students')).toEqualTypeOf<Student[]>();
    expect(await readById('students', 'student-1')).toBeUndefined();
    expect(rows.students).toEqual([]);
    expect((await readSnapshot(['students'], { includeDeleted: true })).students).toHaveLength(1);
    expect(await readSnapshot([])).toEqual({});
  });
  it('drains an aborted snapshot transaction and permits a subsequent retry', async () => {
    const spy = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementationOnce(() => { throw failure; });
    await expect(readSnapshot(['students', 'teachers'])).rejects.toBe(failure);
    spy.mockRestore();
    expect(await readSnapshot(['students', 'teachers'])).toEqual({ students: [], teachers: [] });
  });
  it('never caches default billing policy when settings storage failed', async () => {
    const spy = vi.spyOn(database, 'getDB').mockRejectedValue(failure);
    await expect(getSettings()).rejects.toBe(failure);
    expect(peekSettings()).toBeNull();
    spy.mockRestore();
    await dbPut('settings', { id: 'main', sessionsPerMonth: 12 });
    expect((await getSettings()).sessionsPerMonth).toBe(12);
  });
});
