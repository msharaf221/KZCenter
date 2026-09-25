import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../data/database';
import { dbPut } from '../data/records';
import { readAll, readById, readSnapshot } from '../data/readers';
import { BILLING_STORES } from '../services/billing/unitOfWork';
import { enrollStudent, unenrollStudent } from '../services/enrollmentService';
import { renewEnrollment } from '../services/renewalService';
import { transferStudent } from '../services/transferService';
import { getDebtors, getStudentBalance } from '../services/balanceService';
import { payStudentRemaining, recordInstallmentPayment, recordRefund, voidPayment } from '../services/paymentService';
import { reviewWriteOff, writeOffDebts } from '../services/debtWriteOffService';
import { markPendingPaymentPaid } from '../services/commands/payments';
import { cleanGroupMembers } from '../services/groupService';
import { setSettingsCache } from '../lib/settings';
import { payrollGroup, payrollStudent, PAYROLL_NOW } from './helpers/payroll';

const studentId = 'student-1', groupId = 'group-1';
const actor = { id: 'test-admin', username: 'Synthetic admin', role: 'admin' as const };
async function seed() {
  await dbPut('students', payrollStudent({ enrolledGroups: [], totalOwed: 0 }));
  await dbPut('groups', payrollGroup({ studentIds: [] }));
  await dbPut('groups', payrollGroup({ id: 'group-2', courseId: 'course-2', studentIds: [] }));
  for (const [id, price] of [['course-1', 200], ['course-2', 400]] as const) await dbPut('courses', { id, name: id, price, durationMonths: 1, sessionsPerMonth: 8, category: 'test', levels: [], icon: 'x', color: '#000000', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
}
beforeEach(async () => {
  const db = await getDB();
  for (const store of db.objectStoreNames) await db.clear(store);
  setSettingsCache(null);
  await seed();
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });

function failStudentWrite(matches: (row: { id?: string; totalOwed?: number }) => boolean = () => true) {
  const put = IDBObjectStore.prototype.put;
  let failed = false;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (!failed && this.name === 'students' && matches(value as { id?: string; totalOwed?: number })) {
      failed = true;
      throw new DOMException('Synthetic late ledger failure', 'AbortError');
    }
    return put.call(this, value, key);
  });
  return () => failed;
}
async function mustFail(action: () => Promise<{ success?: boolean }>) {
  let result: { success?: boolean } | undefined, failure: unknown;
  try { result = await action(); } catch (error) { failure = error; }
  expect(Boolean(failure) || result?.success === false).toBe(true);
}

describe('one transaction for each complete student financial workflow', () => {
  it.each(['enroll', 'renew', 'transfer', 'unenroll', 'collect', 'pending', 'void', 'refund', 'writeoff'] as const)('rolls back every store and counter on a late %s failure', async operation => {
    if (operation !== 'enroll') expect((await enrollStudent(studentId, groupId, 50)).success).toBe(true);
    if (operation === 'pending') await dbPut('payments', { id: 'pending', studentId, amount: 25, status: 'pending', type: 'subscription', date: '2026-09-24', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
    const paymentId = (await readAll('payments')).find(row => row.status === 'paid')?.id || '';
    const before = await readSnapshot(BILLING_STORES, { includeDeleted: true });
    const failed = failStudentWrite(row => operation === 'enroll' ? row.totalOwed === 200 : operation === 'renew' ? row.totalOwed === 400 : operation === 'transfer' ? row.totalOwed === 400 : true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const actions = {
      enroll: () => enrollStudent(studentId, groupId, 75),
      renew: () => renewEnrollment({ studentId, groupId, initialPayment: 75 }),
      transfer: () => transferStudent({ studentId, fromGroupId: groupId, toGroupId: 'group-2' }),
      unenroll: () => unenrollStudent(studentId, groupId, 'Synthetic withdrawal'),
      collect: () => recordInstallmentPayment({ studentId, amount: 25 }),
      pending: () => markPendingPaymentPaid(actor, 'pending').then(() => ({ success: true })),
      void: () => voidPayment({ paymentId, reason: 'Synthetic cancellation' }),
      refund: () => recordRefund({ studentId, paymentId, amount: 25, reason: 'Synthetic refund' }),
      writeoff: () => writeOffDebts('all', 'Synthetic review'),
    };
    await mustFail(actions[operation]);
    expect(failed()).toBe(true);
    expect(await readSnapshot(BILLING_STORES, { includeDeleted: true })).toEqual(before);
  });
  it('rolls back a multi-student write-off even after an earlier student was rebuilt', async () => {
    await dbPut('students', payrollStudent({ id: 'student-2', enrolledGroups: [] }));
    await enrollStudent(studentId, groupId, 50);
    await enrollStudent('student-2', groupId, 25);
    const before = await readSnapshot(BILLING_STORES, { includeDeleted: true });
    const failed = failStudentWrite(row => row.id === 'student-2');
    await expect(writeOffDebts('all', 'Synthetic review')).rejects.toBeDefined();
    expect(failed()).toBe(true);
    expect(await readSnapshot(BILLING_STORES, { includeDeleted: true })).toEqual(before);
  });
});

describe('concurrent commands read their authoritative state under the write lock', () => {
  it('does not enroll the same student twice', async () => {
    const results = await Promise.all([enrollStudent(studentId, groupId, 20), enrollStudent(studentId, groupId, 20)]);
    expect(results.filter(row => row.success)).toHaveLength(1);
    expect(await readAll('enrollments')).toHaveLength(1);
    expect(await readAll('installments')).toHaveLength(1);
    expect(await readAll('payments')).toHaveLength(1);
    expect((await readAll('counters'))[0].value).toBe(1);
  });
  it('allocates the final available place to only one concurrent student', async () => {
    await dbPut('groups', payrollGroup({ studentIds: [], maxStudents: 1 }));
    await dbPut('students', payrollStudent({ id: 'student-2', enrolledGroups: [] }));
    const results = await Promise.all([enrollStudent(studentId, groupId), enrollStudent('student-2', groupId)]);
    expect(results.filter(row => row.success)).toHaveLength(1);
    const group = await readById('groups', groupId);
    expect(group?.studentIds).toHaveLength(1);
    expect(group?.status).toBe('full');
  });
  it('replays both concurrent collections without losing paid amounts or receipt numbers', async () => {
    await enrollStudent(studentId, groupId);
    await Promise.all([recordInstallmentPayment({ studentId, amount: 20 }), recordInstallmentPayment({ studentId, amount: 30 })]);
    expect((await readAll('installments'))[0].paidAmount).toBe(50);
    expect((await readById('students', studentId))?.totalPaid).toBe(50);
    expect(new Set((await readAll('payments')).map(row => row.receiptNo)).size).toBe(2);
  });
  it('does not refund more than the remaining net collections across concurrent requests', async () => {
    await enrollStudent(studentId, groupId, 100);
    const results = await Promise.all([1, 2].map(() => recordRefund({ studentId, amount: 80, reason: 'Synthetic refund' })));
    expect(results.filter(row => row.success)).toHaveLength(1);
    expect(await readAll('refunds')).toHaveLength(1);
    expect((await readById('students', studentId))?.totalPaid).toBe(20);
  });
  it('does not collect the same remaining amount twice', async () => {
    await enrollStudent(studentId, groupId);
    const results = await Promise.all([payStudentRemaining(studentId), payStudentRemaining(studentId)]);
    expect(results.filter(row => row.success)).toHaveLength(1);
    expect(await readAll('payments')).toHaveLength(1);
    expect((await getStudentBalance(studentId))?.remaining).toBe(0);
  });
  it('preserves consecutive renewal indices/history instead of overwriting a competing cycle', async () => {
    await enrollStudent(studentId, groupId);
    const results = await Promise.all(['2026-10-01', '2026-11-01'].map(startDate => renewEnrollment({ studentId, groupId, startDate })));
    expect(results.map(row => row.cycle).sort()).toEqual([1, 2]);
    expect((await readAll('enrollments'))[0].renewals).toHaveLength(2);
    expect((await readAll('installments')).map(row => row.periodIndex).sort()).toEqual([1, 2, 3]);
  });
  it('does not resurrect stale memberships from a catalog cleanup snapshot', async () => {
    const stale = await readAll('groups');
    await enrollStudent(studentId, groupId);
    const cleaned = await cleanGroupMembers(stale, []);
    expect(cleaned.find(row => row.id === groupId)?.studentIds).toEqual([studentId]);
    expect((await readById('groups', groupId))?.studentIds).toEqual([studentId]);
  });
});

describe('financial read projections and reviewed destructive actions', () => {
  it('rejects a stale write-off review without cancelling newly added liabilities', async () => {
    await enrollStudent(studentId, groupId);
    const review = await reviewWriteOff('all');
    await renewEnrollment({ studentId, groupId });
    const before = await readAll('installments');
    const result = await writeOffDebts('all', 'Synthetic review', { today: review.today, expectedFingerprint: review.fingerprint });
    expect(result.success).toBe(false);
    expect(result.error).toContain('المعاينة');
    expect(await readAll('installments')).toEqual(before);
  });
  it('accepts an unchanged review and preserves gross allocation versus net-refund balance semantics', async () => {
    await enrollStudent(studentId, groupId, 100);
    await recordRefund({ studentId, amount: 20, reason: 'Synthetic refund' });
    expect((await readAll('installments'))[0].paidAmount).toBe(100);
    expect((await getStudentBalance(studentId))?.paid).toBe(80);
    const review = await reviewWriteOff('all');
    expect((await writeOffDebts('all', 'Synthetic review', { today: review.today, expectedFingerprint: review.fingerprint })).success).toBe(true);
  });
  it('reads one fixed-size snapshot for all debtors instead of querying again for each student', async () => {
    for (let i = 0; i < 20; i++) {
      const id = `synthetic-${i}`;
      await dbPut('students', payrollStudent({ id, enrolledGroups: [] }));
      await enrollStudent(id, 'group-2');
    }
    const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    expect(await getDebtors()).toHaveLength(20);
    expect(reads).toHaveBeenCalledTimes(6);
  });
  it.each([NaN, Infinity, -1, 0.001])('rejects malformed financial amounts without reserving a receipt: %s', async amount => {
    await enrollStudent(studentId, groupId);
    const before = await readSnapshot(BILLING_STORES, { includeDeleted: true });
    expect((await recordInstallmentPayment({ studentId, amount })).success).toBe(false);
    expect((await recordRefund({ studentId, amount, reason: 'Synthetic' })).success).toBe(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await renewEnrollment({ studentId, groupId, initialPayment: amount })).success).toBe(false);
    expect(await readSnapshot(BILLING_STORES, { includeDeleted: true })).toEqual(before);
  });
});


it.each(['', '2026-02-31', 'not-a-date'])('rejects explicit invalid dates without changing money or liabilities: %s', async date => {
  await enrollStudent(studentId, groupId, 25);
  const before = await readSnapshot(BILLING_STORES, { includeDeleted: true });
  expect((await recordInstallmentPayment({ studentId, amount: 10, date })).success).toBe(false);
  expect((await recordRefund({ studentId, amount: 10, date, reason: 'Synthetic' })).success).toBe(false);
  expect((await writeOffDebts('all', 'Synthetic', { today: date })).success).toBe(false);
  expect(await readSnapshot(BILLING_STORES, { includeDeleted: true })).toEqual(before);
});
