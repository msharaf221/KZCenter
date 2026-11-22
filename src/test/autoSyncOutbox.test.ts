import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, DB_NAME, getDB } from '../data/database';
import { dbAdd, dbPut } from '../data/records';
import { getSyncOutboxCount, readSyncOutboxBatch } from '../data/syncOutbox';
import type { Payment, Student } from '../domain/models';
import { flushSyncOutbox } from '../services/sync/outbox';
import type { SyncRemote, SyncRow } from '../services/sync/ports';
import { writeTransaction } from '../data/transactions';

const student: Student = {
  id: 'student-outbox-1',
  name: 'طالب تجريبي',
  age: 12,
  gender: 'male',
  parentPhone: '01000000000',
  status: 'active',
  totalPaid: 0,
  enrolledGroups: [],
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

const payment: Payment = {
  id: 'payment-outbox-1',
  studentId: student.id,
  amount: 275,
  type: 'subscription',
  status: 'paid',
  date: '2026-10-18',
  method: 'cash',
  collectedBy: 'local-user-1',
  collectedByName: 'موظف تجريبي',
  createdAt: '2026-10-18T10:05:00.000Z',
  updatedAt: '2026-10-18T10:05:00.000Z',
};

function remote(overrides: Partial<SyncRemote> = {}): SyncRemote {
  return {
    prepare: vi.fn(async () => ({ ok: true })),
    read: vi.fn(async () => ({ rows: [] as SyncRow[] })),
    write: vi.fn(async () => ({})),
    remove: vi.fn(async () => ({})),
    removeMany: vi.fn(async () => ({})),
    ...overrides,
  };
}

beforeEach(async () => {
  await closeDatabase();
  await deleteDB(DB_NAME);
});

afterEach(async () => {
  await closeDatabase();
  vi.restoreAllMocks();
});

describe('durable auto-sync outbox', () => {
  it('journals cloud row writes atomically and coalesces repeated edits without copying PII', async () => {
    await writeTransaction(['students'], async tx => {
      await tx.objectStore('students').put(student);
      await tx.objectStore('students').put({ ...student, name: 'اسم أحدث' });
    });

    const db = await getDB();
    const entries = await readSyncOutboxBatch();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'students:student-outbox-1',
      table: 'students',
      rowId: 'student-outbox-1',
      operation: 'upsert',
      version: 2,
    });
    expect(entries[0]).not.toHaveProperty('row');
    expect(entries[0]).not.toHaveProperty('name');
    expect(await db.get('students', student.id)).toMatchObject({ name: 'اسم أحدث' });
  });

  it('rolls back the local row and journal together if the business transaction fails', async () => {
    await expect(writeTransaction(['payments'], async tx => {
      await tx.objectStore('payments').put(payment);
      throw new Error('simulated abort');
    })).rejects.toThrow('simulated abort');

    const db = await getDB();
    expect(await db.get('payments', payment.id)).toBeUndefined();
    expect(await getSyncOutboxCount()).toBe(0);
  });

  it('does not create an upload echo when a cloud row is pulled into local storage', async () => {
    await dbPut('students', student, { trackCloudChanges: false });
    expect(await getSyncOutboxCount()).toBe(0);
    expect(await (await getDB()).get('students', student.id)).toMatchObject({ id: student.id });
  });

  it('pushes only changed rows, strips internal cloud fields, then acknowledges the exact revision', async () => {
    await dbAdd('payments', payment);
    const client = remote({
      write: vi.fn(async (_table, _rows, _conflict) => ({})),
    });

    const report = await flushSyncOutbox(client);

    expect(report).toMatchObject({ ok: true, attempted: 1, synchronized: 1, pending: 0 });
    expect(client.write).toHaveBeenCalledTimes(1);
    expect(client.write).toHaveBeenCalledWith('payments', [expect.objectContaining({
      id: payment.id,
      student_id: payment.studentId,
      collected_by_name: payment.collectedByName,
    })], 'id');
    const sent = vi.mocked(client.write).mock.calls[0][1][0];
    expect(sent).not.toHaveProperty('tenant_id');
    expect(sent).not.toHaveProperty('password_hash');
    expect(await getSyncOutboxCount()).toBe(0);
  });

  it('keeps a failed upload for retry and records bounded exponential backoff', async () => {
    await dbAdd('payments', payment);
    const client = remote({ prepare: vi.fn(async () => ({ ok: false, error: 'offline test' })) });

    const report = await flushSyncOutbox(client);
    const db = await getDB();
    const entry = await db.get('sync_outbox', `payments:${payment.id}`);

    expect(report).toMatchObject({ ok: false, attempted: 1, synchronized: 0, pending: 1 });
    expect(entry).toMatchObject({ attempts: 1, lastError: 'offline test' });
    expect(new Date(entry!.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('propagates hard deletes and never acknowledges a newer edit that races an upload', async () => {
    await dbAdd('students', student);
    await writeTransaction(['students'], tx => tx.objectStore('students').delete(student.id));
    const deleteRemote = remote();
    const deleteReport = await flushSyncOutbox(deleteRemote);
    expect(deleteReport.synchronized).toBe(1);
    expect(deleteRemote.removeMany).toHaveBeenCalledWith('students', [student.id]);
    expect(await getSyncOutboxCount()).toBe(0);

    await dbAdd('students', student);
    const raced = remote({
      write: vi.fn(async () => {
        await dbPut('students', { ...student, name: 'تعديل أثناء الرفع' });
        return {};
      }),
    });
    const raceReport = await flushSyncOutbox(raced);
    const remaining = await readSyncOutboxBatch();
    expect(raceReport.synchronized).toBe(0);
    expect(remaining).toHaveLength(1);
    expect((await (await getDB()).get('students', student.id))?.name).toBe('تعديل أثناء الرفع');
  });
});
