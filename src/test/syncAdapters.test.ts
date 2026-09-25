import * as readers from '../data/readers';
import * as database from '../data/database';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAdd, dbClearStore, dbGetAll, dbSoftDelete } from '../data/records';
import { CLOUD_TABLES } from '../data/stores';
import { syncCloudToLocal, syncLocalToCloud } from '../services/sync/actions';
import { backupToCloud, cloudBackupSnapshot } from '../services/cloudBackupService';
import { payrollStudent } from './helpers/payroll';

const sdk = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  writes: vi.fn(),
  insert: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'synthetic-center' } } } })),
}));
vi.mock('../data/cloud/client', () => ({
  getSupabaseConfigured: () => true,
  getSupabaseClient: () => client,
}));
const client = {
  auth: { getSession: sdk.getSession },
  from: (table: string) => ({
    select: () => ({
      order: () => ({ range: async () => ({ data: table === 'students' ? sdk.rows : [], error: null }) }),
    }),
    upsert: async (rows: unknown, options: unknown) => {
      sdk.writes(table, rows, options);
      return { error: null };
    },
    insert: async (row: unknown) => {
      sdk.insert(table, row);
      return { error: null };
    },
  }),
};
beforeEach(async () => {
  for (const store of CLOUD_TABLES) await dbClearStore(store);
  sdk.rows = [];
  sdk.writes.mockClear();
  sdk.insert.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('sync/backup persistence adapters', () => {
  it('pushes a real IndexedDB tombstone and does not resurrect it during pull', async () => {
    await dbAdd('students', payrollStudent());
    await dbSoftDelete('students', 'student-1');
    expect((await syncLocalToCloud({ silent: true })).ok).toBe(true);
    expect(sdk.writes).toHaveBeenCalledWith('students', [expect.objectContaining({ deleted: true })], {
      onConflict: 'id',
    });
    sdk.rows = [{ id: 'student-1', name: 'old remote', updated_at: '2000-01-01', deleted: false }];
    await syncCloudToLocal({ silent: true });
    expect(await dbGetAll('students')).toEqual([]);
    expect((await dbGetAll('students', { includeDeleted: true }))[0].deleted).toBe(true);
  });
  it('never stores incoming snake/camel tenant metadata locally', async () => {
    sdk.rows = [{ id: 'new', name: 'Synthetic', tenant_id: 'private', password_hash: 'synthetic' }];
    await syncCloudToLocal({ silent: true });
    const row = (await dbGetAll('students'))[0];
    expect(row).toMatchObject({ id: 'new', name: 'Synthetic' });
    expect(row).not.toHaveProperty('tenantId');
    expect(row).not.toHaveProperty('passwordHash');
  });
  it('sanitizes cloud backup metadata without mutating local backup data', () => {
    const input = {
      includeUsers: true,
      users: [{ passwordHash: 'synthetic' }],
      settings: { id: 'main', tenantId: 'private' },
      students: [{ id: 'x', token: 'synthetic' }],
    };
    expect(cloudBackupSnapshot(input)).toEqual({
      includeUsers: false,
      settings: { id: 'main' },
      students: [{ id: 'x' }],
    });
    expect(input).toHaveProperty('users');
    expect(input.students[0].token).toBe('synthetic');
  });
  it('uses the same engine for backup synchronization, including singleton settings', async () => {
    await dbAdd('settings', { id: 'main', centerName: 'Synthetic center' });
    const result = await backupToCloud();
    expect(result.success).toBe(true);
    expect(sdk.writes).toHaveBeenCalledWith('settings', [{ id: 'main', center_name: 'Synthetic center' }], {
      onConflict: 'id,tenant_id',
    });
    const metadata = sdk.insert.mock.calls[0][1] as { data_snapshot: string };
    expect(JSON.parse(metadata.data_snapshot)).not.toHaveProperty('users');
  });
});


it('does not report an empty successful push when a local table read failed', async () => {
  vi.spyOn(readers, 'readAll').mockRejectedValueOnce(new Error('Synthetic student read failure'));
  const report = await syncLocalToCloud({ silent: true });
  expect(report.ok).toBe(false);
  expect(report.errors).toContain('students: Error: Synthetic student read failure');
  expect(sdk.writes.mock.calls.some(([table]) => table === 'students')).toBe(false);
});
it('does not overwrite local rows during pull when their existing state could not be read', async () => {
  await dbAdd('students', payrollStudent());
  sdk.rows = [{ id: 'student-1', name: 'Synthetic remote replacement', updated_at: '2099-01-01' }];
  vi.spyOn(readers, 'readAll').mockRejectedValueOnce(new Error('Synthetic student read failure'));
  expect((await syncCloudToLocal({ silent: true })).ok).toBe(false);
  expect((await dbGetAll('students'))[0].name).toBe(payrollStudent().name);
});
it('never uploads an empty cloud archive when its local export failed', async () => {
  vi.spyOn(database, 'getDB').mockRejectedValueOnce(new Error('Synthetic export failure'));
  expect((await backupToCloud()).success).toBe(false);
  expect(sdk.insert).not.toHaveBeenCalled();
  expect(sdk.writes).not.toHaveBeenCalled();
});
