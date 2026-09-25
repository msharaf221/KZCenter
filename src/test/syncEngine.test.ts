import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_TABLES } from '../data/stores';
import { createSyncEngine } from '../services/sync/engine';
import type { SyncLocal, SyncRemote, SyncRow } from '../services/sync/ports';
import { CONFLICT_TARGET } from '../services/sync/policy';
import { fetchAllRows } from '../services/sync/transport';
import { ensureSessionForClient } from '../services/cloud/session';
import { clearCloudCredentials } from '../data/cloud/config';
import { stripInternalCloud, transformKeys, toSnakeCase } from '../domain/sync/rows';

function ports() {
  const local: SyncLocal = { read: vi.fn(async () => []), write: vi.fn(async () => {}) };
  const remote: SyncRemote = {
    prepare: vi.fn(async () => ({ ok: true })),
    read: vi.fn(async () => ({ rows: [] })),
    write: vi.fn(async () => ({})),
  };
  return { local, remote, run: createSyncEngine(local, remote) };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sync orchestration', () => {
  it('uses the complete allowlist but never reads or writes users', async () => {
    const { local, remote, run } = ports();
    const report = await run('push');
    expect(vi.mocked(local.read).mock.calls.map(([table]) => table)).toEqual(CLOUD_TABLES);
    expect(local.read).not.toHaveBeenCalledWith('users');
    expect(remote.write).not.toHaveBeenCalled();
    expect(report).toMatchObject({ ok: true, direction: 'push', total: 0 });
  });
  it('does not touch data when authentication fails or throws', async () => {
    const { local, remote, run } = ports();
    vi.mocked(remote.prepare)
      .mockResolvedValueOnce({ ok: false, error: 'denied' })
      .mockRejectedValueOnce(new Error('offline'));
    expect(await run('pull')).toMatchObject({ ok: false, errors: ['denied'], tables: [] });
    expect(await run('push')).toMatchObject({ ok: false, errors: ['Error: offline'] });
    expect(local.read).not.toHaveBeenCalled();
    expect(remote.read).not.toHaveBeenCalled();
  });
  it('batches pushes and preserves composite conflict targets', async () => {
    const { local, remote, run } = ports();
    vi.mocked(local.read).mockImplementation(async table =>
      table === 'payroll' ? Array.from({ length: 805 }, (_, id) => ({ id: String(id) })) : [],
    );
    expect((await run('push')).total).toBe(805);
    expect(vi.mocked(remote.write).mock.calls.map(([, rows]) => rows.length)).toEqual([400, 400, 5]);
    expect(vi.mocked(remote.write).mock.calls.every(([, , target]) => target === CONFLICT_TARGET.payroll)).toBe(true);
  });
  it('retains tombstones and removes credentials/tenant metadata before push', async () => {
    const { local, remote, run } = ports();
    vi.mocked(local.read).mockImplementation(async table =>
      table === 'students'
        ? [
            {
              id: 'deleted',
              deleted: true,
              updatedAt: '2026-09-24',
              passwordHash: 'synthetic',
              tenantId: 'private',
              tenant_id: 'private',
            },
          ]
        : [],
    );
    await run('push');
    expect(remote.write).toHaveBeenCalledWith(
      'students',
      [{ id: 'deleted', deleted: true, updated_at: '2026-09-24' }],
      'id',
    );
  });
  it('does not resurrect a newer local tombstone or overwrite equal/newer rows', async () => {
    const { local, remote, run } = ports();
    vi.mocked(local.read).mockResolvedValue([{ id: 'same', deleted: true, updatedAt: '2026-09-24' }]);
    vi.mocked(remote.read).mockImplementation(async table => ({
      rows: table === 'students' ? [{ id: 'same', updated_at: '2026-09-01', deleted: false }] : [],
    }));
    const report = await run('pull');
    expect(local.write).not.toHaveBeenCalled();
    expect(report.tables.find(t => t.table === 'students')?.skipped).toBe(1);
  });
  it('sanitizes incoming tenant fields after camel conversion and ignores missing identifiers', async () => {
    const { local, remote, run } = ports();
    vi.mocked(remote.read).mockImplementation(async table => ({
      rows:
        table === 'students'
          ? [
              {
                id: 'new',
                full_name: 'Synthetic student',
                updated_at: '2026-09-24',
                tenant_id: 'private',
                password_hash: 'synthetic',
              },
              { name: 'no id' },
            ]
          : [],
    }));
    expect((await run('pull')).total).toBe(1);
    expect(local.write).toHaveBeenCalledWith('students', {
      id: 'new',
      fullName: 'Synthetic student',
      updatedAt: '2026-09-24',
    });
    expect(stripInternalCloud({ tenantId: 'private', id: 'x' })).toEqual({ id: 'x' });
  });
  it('updates the merge index so overlapping pages cannot restore older versions', async () => {
    const { remote, local, run } = ports();
    vi.mocked(remote.read).mockImplementation(async table => ({
      rows:
        table === 'students'
          ? [
              { id: 'x', updated_at: '2026-09-24' },
              { id: 'x', updated_at: '2026-09-01' },
            ]
          : [],
    }));
    expect((await run('pull')).total).toBe(1);
    expect(local.write).toHaveBeenCalledOnce();
  });
  it('reports partial-page failures and continues with other tables', async () => {
    const { remote, run } = ports();
    vi.mocked(remote.read).mockImplementation(async table =>
      table === 'students' ? { rows: [{ id: 'x' }], error: 'second page failed' } : { rows: [] },
    );
    const report = await run('pull');
    expect(report).toMatchObject({ ok: false, total: 1, errors: ['students: second page failed'] });
    expect(report.tables).toHaveLength(CLOUD_TABLES.length);
  });
  it('counts only successful push batches', async () => {
    const { remote, local, run } = ports();
    vi.mocked(local.read).mockImplementation(async table =>
      table === 'students' ? Array.from({ length: 801 }, (_, id) => ({ id })) : [],
    );
    vi.mocked(remote.write).mockResolvedValueOnce({}).mockResolvedValueOnce({ error: 'quota' });
    expect(await run('push')).toMatchObject({ ok: false, total: 400, errors: ['students: quota'] });
    expect(remote.write).toHaveBeenCalledTimes(2);
  });
  it('treats suspicious property names as data, never as prototype setters', () => {
    const row = JSON.parse('{"__proto__":{"polluted":true},"fullName":"Synthetic"}') as SyncRow;
    const output = transformKeys(row, toSnakeCase);
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(output.full_name).toBe('Synthetic');
    expect(output.polluted).toBeUndefined();
    expect(row.fullName).toBe('Synthetic');
  });
});

describe('cloud paging and session adapters', () => {
  it('uses ordered ranges until all rows have been fetched, including exact page multiples', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const order = vi.fn(() => ({ range }));
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })) } as unknown as SupabaseClient;
    expect((await fetchAllRows('students', client)).rows).toHaveLength(1000);
    expect(order).toHaveBeenCalledWith('id');
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
  it('returns accumulated pages on a later SDK error instead of silently truncating', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(1000).fill({ id: 'synthetic' }), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const client = { from: () => ({ select: () => ({ order: () => ({ range }) }) }) } as unknown as SupabaseClient;
    const result = await fetchAllRows('students', client);
    expect(result.rows).toHaveLength(1000);
    expect(result.error).toBe('offline');
  });
  it('shares session checks per client without sharing readiness across projects', async () => {
    vi.useFakeTimers();
    const a = { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'test-a' } } } })) } };
    const b = { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } };
    const client = a as unknown as SupabaseClient;
    expect(await Promise.all([ensureSessionForClient(client), ensureSessionForClient(client)])).toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(a.auth.getSession).toHaveBeenCalledOnce();
    clearCloudCredentials();
    expect((await ensureSessionForClient(b as unknown as SupabaseClient)).ok).toBe(false);
    await vi.runAllTimersAsync();
  });
  it('an older completion timer cannot invalidate a newer forced session check', async () => {
    vi.useFakeTimers();
    const fake = { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'test-a' } } } })) } };
    const client = fake as unknown as SupabaseClient;
    await ensureSessionForClient(client);
    await vi.advanceTimersByTimeAsync(1000);
    await ensureSessionForClient(client, true);
    await vi.advanceTimersByTimeAsync(1000);
    await ensureSessionForClient(client);
    expect(fake.auth.getSession).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
  });
});
