import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../data/database';
import { readAll, readById } from '../data/readers';
import { dbPut } from '../data/records';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { restoreBackup, restoreConfirmedBackup } from '../services/backup/restore';
import { claimBackupOperation, finishBackupOperation, getBackupRuntime } from '../services/backup/state';
import { payrollStudent } from './helpers/payroll';

vi.mock('../lib/security', () => ({ addAuditEntry: vi.fn() }));
vi.mock('../lib/notifications', () => ({ notify: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
const admin = { id: 'synthetic-admin', username: 'synthetic', role: 'admin' as const };
const content = () => JSON.stringify({ students: [payrollStudent({ id: 'restored' })], teachers: [], courses: [], groups: [] });
beforeEach(async () => {
  vi.clearAllMocks();
  const db = await getDB();
  for (const store of db.objectStoreNames) await db.clear(store);
  await dbPut('students', payrollStudent());
  finishBackupOperation('running');
  finishBackupOperation('restoring');
  delete window.electronAPI;
});
afterEach(() => { vi.restoreAllMocks(); delete window.electronAPI; });

describe('restore application boundary', () => {
  it.each([undefined, { ...admin, role: 'teacher' as const }, { ...admin, mustChangePassword: true }])('rejects unauthorized actors before reading a restore file', async actor => {
    await expect(restoreConfirmedBackup(actor, 'file', true, content())).rejects.toThrow();
    expect(await readById('students', 'student-1')).toBeDefined();
  });
  it('requires explicit confirmation and uses the atomic importer after authorization', async () => {
    await expect(restoreConfirmedBackup(admin, 'file', false, content())).rejects.toThrow('تأكيد');
    expect(await restoreConfirmedBackup(admin, 'file', true, content())).toBe(true);
    expect((await readAll('students')).map(row => row.id)).toEqual(['restored']);
    expect(getBackupRuntime().restoring).toBe(false);
  });
  it.each(['invalid JSON', 'null', '[]', '{"students":[],"teachers":[],"courses":[],"groups":null}', '{"students":[],"teachers":[],"courses":[],"groups":[],"users":[{}]}'])('does not modify any data when file structure is invalid: %s', async input => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await restoreBackup('file', input)).toBe(false);
    expect(await readById('students', 'student-1')).toBeDefined();
    expect(getBackupRuntime().restoring).toBe(false);
  });
  it('rolls back a complete JSON restore on a late IndexedDB put failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = JSON.parse(content());
    data.users = [{ id: 'one', username: 'test-one' }, { id: 'two', username: 'test-two' }];
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'users' && (value as { id: string }).id === 'two') throw new DOMException('Synthetic failed write', 'AbortError');
      return put.call(this, value, key);
    });
    expect(await restoreBackup('file', JSON.stringify(data))).toBe(false);
    expect(await readById('students', 'student-1')).toBeDefined();
    expect(await readById('students', 'restored')).toBeUndefined();
    expect(await readAll('users')).toEqual([]);
  });
  it('does not misreport a committed restore as failed when its audit metadata cannot be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(addAuditEntry).mockImplementationOnce(() => { throw new Error('Synthetic quota'); });
    expect(await restoreBackup('file', content())).toBe(true);
    expect(await readById('students', 'restored')).toBeDefined();
    expect(notify.warning).toHaveBeenCalledOnce();
  });
  it('shares the operation lock with backup execution, including the native file picker wait', async () => {
    claimBackupOperation('running');
    expect(await restoreBackup('file', content())).toBe(false);
    finishBackupOperation('running');
    let resolve!: (value: { success: boolean; data: string }) => void;
    const restoreLocal = vi.fn(() => new Promise<{ success: boolean; data: string }>(done => { resolve = done; }));
    window.electronAPI = { isElectron: true, backup: { restoreLocal } } as unknown as ElectronAPI;
    const restoring = restoreConfirmedBackup(admin, 'local', true);
    expect(getBackupRuntime().restoring).toBe(true);
    expect(claimBackupOperation('running')).toBe(false);
    expect(await restoreBackup('file', content())).toBe(false);
    resolve({ success: true, data: content() });
    expect(await restoring).toBe(true);
    expect(restoreLocal).toHaveBeenCalledOnce();
    expect(getBackupRuntime().restoring).toBe(false);
  });
});
