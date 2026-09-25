import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../data/database';
import { dbPut } from '../data/records';
import { readAll, readById, readSnapshot } from '../data/readers';
import { runIntegrityFix, migrateInstallments, markOverdueInstallments } from '../services/maintenanceService';
import { enrollStudent } from '../services/enrollmentService';
import { recordInstallmentPayment } from '../services/paymentService';
import { auditData, repairQuality } from '../services/maintenance/quality';
import { planIntegrity } from '../domain/maintenance/integrity';
import { setSettingsCache } from '../lib/settings';
import { payrollGroup, payrollInstallment, payrollStudent, payrollTeacher, PAYROLL_NOW } from './helpers/payroll';

const stores = ['students', 'groups', 'courses', 'teachers', 'enrollments', 'installments', 'payments', 'refunds', 'counters'] as const;
const snapshot = () => readSnapshot(stores, { includeDeleted: true });
const enrollment = () => ({ id: 'enrollment-1', studentId: 'student-1', groupId: 'group-1', status: 'active' as const, enrolledAt: '2026-09-01', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
beforeEach(async () => {
  setSettingsCache(null); const db = await getDB(); for (const name of db.objectStoreNames) await db.clear(name);
  await dbPut('students', payrollStudent({ totalOwed: 0 }));
  await dbPut('groups', payrollGroup());
  await dbPut('teachers', payrollTeacher());
  await dbPut('courses', { id: 'course-1', name: 'رياضيات', price: 200, durationMonths: 1, category: 'test', levels: [], color: '#000000', icon: 'x', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });

function fault(store: string, predicate: (row: Record<string, unknown>) => boolean = () => true) {
  const put = IDBObjectStore.prototype.put; let hit = false;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (!hit && this.name === store && predicate(value as Record<string, unknown>)) { hit = true; throw new DOMException('Synthetic repair failure', 'AbortError'); }
    return put.call(this, value, key);
  });
  return () => hit;
}

describe('link repair respects authoritative enrollment history', () => {
  it.each(['dropped', 'transferred', 'completed', 'deleted'] as const)('does not reactivate an explicit %s enrollment from stale arrays', async state => {
    await dbPut('enrollments', { ...enrollment(), status: state === 'deleted' ? 'active' : state, deleted: state === 'deleted' });
    await dbPut('installments', payrollInstallment({ amount: 200, paidAmount: 50 }));
    const bills = await readAll('installments');
    await runIntegrityFix();
    expect((await readById('students', 'student-1'))?.enrolledGroups).toEqual([]);
    expect((await readById('groups', 'group-1'))?.studentIds).toEqual([]);
    expect((await readAll('enrollments')).some(row => row.status === 'active')).toBe(false);
    expect(await readAll('installments')).toEqual(bills); // Repair is not a write-off.
  });
  it('uses repaired arrays throughout rather than reintroducing links removed in an earlier step', async () => {
    await dbPut('students', payrollStudent({ enrolledGroups: ['missing-group'], school: 'Preserved school' }));
    await dbPut('groups', payrollGroup({ studentIds: ['missing-student'], maxStudents: 1 }));
    await dbPut('enrollments', enrollment());
    await runIntegrityFix();
    expect(await readById('students', 'student-1')).toMatchObject({ enrolledGroups: ['group-1'], school: 'Preserved school' });
    expect(await readById('groups', 'group-1')).toMatchObject({ studentIds: ['student-1'], status: 'full' });
  });
  it.each(['student', 'group'] as const)('supports a legacy relationship declared only on the %s without duplicating it', async side => {
    if (side === 'student') await dbPut('groups', payrollGroup({ studentIds: [] }));
    else await dbPut('students', payrollStudent({ enrolledGroups: [] }));
    await runIntegrityFix(); const before = await snapshot();
    expect(await readAll('enrollments')).toHaveLength(1);
    expect((await readById('students', 'student-1'))?.enrolledGroups).toEqual(['group-1']);
    expect((await readById('groups', 'group-1'))?.studentIds).toEqual(['student-1']);
    expect((await runIntegrityFix()).recalculatedStudents).toBe(0);
    expect(await snapshot()).toEqual(before);
  });
  it('rolls back new legacy enrollment, group fixes and earlier profile changes on a late recalculation failure', async () => {
    await dbPut('students', payrollStudent({ enrolledGroups: [], totalOwed: 0 }));
    const before = await snapshot(), hit = fault('students', row => row.totalOwed === 200);
    await expect(runIntegrityFix()).rejects.toBeDefined();
    expect(hit()).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it('keeps ended group status and never changes approved installments or teacher pay agreements', async () => {
    await dbPut('groups', payrollGroup({ status: 'ended' }));
    await dbPut('installments', payrollInstallment({ amount: 75 }));
    const financial = await readSnapshot(['installments', 'teachers']);
    await runIntegrityFix();
    expect((await readById('groups', 'group-1'))?.status).toBe('ended');
    expect(await readSnapshot(['installments', 'teachers'])).toEqual(financial);
  });
  it('does not mutate its input snapshot during pure planning', async () => {
    const input = await snapshot(), before = structuredClone(input);
    planIntegrity(input, '2026-09-24T00:00:00Z');
    expect(input).toEqual(before);
  });
  it('can run concurrently with enrollment without losing the new membership', async () => {
    await dbPut('students', payrollStudent({ enrolledGroups: [] })); await dbPut('groups', payrollGroup({ studentIds: [] }));
    await Promise.all([runIntegrityFix(), enrollStudent('student-1', 'group-1')]);
    expect((await readById('students', 'student-1'))?.enrolledGroups).toEqual(['group-1']);
    expect((await readById('groups', 'group-1'))?.studentIds).toEqual(['student-1']);
    expect(await readAll('enrollments')).toHaveLength(1);
  });
});

describe('serialized installment maintenance', () => {
  it('only creates one plan for concurrent legacy migration calls', async () => {
    await dbPut('enrollments', enrollment());
    const result = await Promise.all([migrateInstallments(), migrateInstallments()]);
    expect(result.map(row => row.installmentsCreated).sort()).toEqual([0, 1]);
    expect(await readAll('installments')).toHaveLength(1);
  });
  it('does not generate debt for inactive/tombstoned history or an orphan enrollment', async () => {
    await dbPut('enrollments', { ...enrollment(), deleted: true });
    await dbPut('enrollments', { ...enrollment(), id: 'orphan', studentId: 'missing' });
    expect((await migrateInstallments()).installmentsCreated).toBe(0);
    expect(await readAll('installments')).toEqual([]);
  });
  it('treats cancelled plans as covered instead of regenerating a written-off subscription', async () => {
    await dbPut('enrollments', enrollment()); await dbPut('installments', payrollInstallment({ status: 'cancelled' }));
    expect((await migrateInstallments()).installmentsCreated).toBe(0);
  });
  it('rolls back every new installment if updating the balance fails', async () => {
    const before = await snapshot(), hit = fault('students');
    await expect(migrateInstallments()).rejects.toBeDefined();
    expect(hit()).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it('does not overwrite fresh paid amounts while marking overdue installments', async () => {
    await dbPut('enrollments', enrollment()); await dbPut('installments', payrollInstallment({ dueDate: '2020-01-01' }));
    await Promise.all([markOverdueInstallments(), recordInstallmentPayment({ studentId: 'student-1', amount: 200 })]);
    expect(await readById('installments', 'installment-1')).toMatchObject({ paidAmount: 200, status: 'paid' });
  });
  it('rolls back earlier status patches when a later installment fails', async () => {
    for (const id of ['a', 'b']) await dbPut('installments', payrollInstallment({ id, dueDate: '2020-01-01' }));
    const before = await snapshot(), hit = fault('installments', row => row.id === 'b');
    await expect(markOverdueInstallments()).rejects.toBeDefined();
    expect(hit()).toBe(true); expect(await snapshot()).toEqual(before);
  });
});

describe('catalog quality repair', () => {
  it('rolls back course/subject repairs if a later teacher update fails', async () => {
    const course = (await readById('courses', 'course-1'))!;
    await dbPut('courses', { ...course, price: 0 });
    const before = await snapshot(), hit = fault('teachers');
    await expect(repairQuality()).rejects.toBeDefined();
    expect(hit()).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it('returns its own coherent post-repair report without an extra read-after-commit phase', async () => {
    const result = await repairQuality({ math: 300 });
    expect(result.report.coursesLinked).toBe(1);
    expect(result.quality).toEqual(await auditData());
    expect((await readById('teachers', 'teacher-1'))?.payRate).toBe(60);
  });
  it('rejects invalid price overrides before persisting any repair', async () => {
    const before = await snapshot();
    await expect(repairQuality({ math: Infinity })).rejects.toThrow('المبلغ');
    expect(await snapshot()).toEqual(before);
  });
});
