import * as ids from '../lib/ids';
import { act, renderHook } from '@testing-library/react';
import { useStudentEditor } from '../features/students/useStudentEditor';
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../data/database';
import { dbPut, dbSoftDelete } from '../data/records';
import { readAll, readById, readSnapshot } from '../data/readers';
import { BILLING_STORES } from '../services/billing/unitOfWork';
import { saveStudent, deleteStudents } from '../services/commands/students';
import { deleteCatalogRecord } from '../services/commands/catalog';
import { enrollStudent } from '../services/enrollmentService';
import { recordInstallmentPayment } from '../services/paymentService';
import { addAuditEntry } from '../lib/audit';
import { setSettingsCache } from '../lib/settings';
import { payrollGroup, payrollInstallment, payrollStudent, PAYROLL_NOW } from './helpers/payroll';

vi.mock('../lib/audit', () => ({ addAuditEntry: vi.fn() }));
const actor = { id: 'synthetic-admin', username: 'Synthetic Admin', role: 'admin' as const };
const snapshot = () => readSnapshot([...BILLING_STORES, 'payroll', 'expenses'], { includeDeleted: true });
const draft = (groups = ['group-1', 'group-2']) => payrollStudent({ name: 'New synthetic student', enrolledGroups: groups });
beforeEach(async () => {
  vi.clearAllMocks(); setSettingsCache(null);
  const db = await getDB(); for (const name of db.objectStoreNames) await db.clear(name);
  await dbPut('students', payrollStudent({ enrolledGroups: [] }));
  await dbPut('students', payrollStudent({ id: 'student-2', enrolledGroups: [] }));
  await dbPut('courses', { id: 'course-1', name: 'Synthetic Course', price: 200, durationMonths: 1, sessionsPerMonth: 8, category: 'test', levels: [], color: '#000000', icon: 'x', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
  for (const id of ['group-1', 'group-2']) await dbPut('groups', payrollGroup({ id, studentIds: [] }));
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });

function failPut(store: string, predicate: (row: Record<string, unknown>) => boolean) {
  const original = IDBObjectStore.prototype.put;
  let failed = false;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (!failed && this.name === store && predicate(value as Record<string, unknown>)) { failed = true; throw new DOMException('Synthetic last write failure', 'AbortError'); }
    return original.call(this, value, key);
  });
  return () => failed;
}

describe('atomic profile and multi-membership submission', () => {
  it('commits the full fresh student, both registrations, payments and counters', async () => {
    const result = await saveStudent(actor, { draft: draft(), initialPayments: { 'group-1': 20, 'group-2': 30 } });
    expect(result.student).toMatchObject({ enrolledGroups: ['group-1', 'group-2'], totalPaid: 50, totalOwed: 400 });
    expect(result.warnings).toEqual([]);
    expect(await readAll('payments')).toHaveLength(2);
    expect((await readAll('counters'))[0].value).toBe(2);
  });
  it('rolls back the profile and earlier group when a later group is unavailable', async () => {
    const before = await snapshot();
    await expect(saveStudent(actor, { draft: draft(['group-1', 'missing']), initialPayments: { 'group-1': 25 } })).rejects.toThrow('المجموعة');
    expect(await snapshot()).toEqual(before);
    expect(addAuditEntry).not.toHaveBeenCalled();
  });
  it('rolls back both groups and their receipt allocations after a late native failure', async () => {
    const before = await snapshot();
    const add = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'payments' && (value as { groupId: string }).groupId === 'group-2') throw new DOMException('Synthetic payment failure', 'AbortError');
      return add.call(this, value, key);
    });
    await expect(saveStudent(actor, { draft: draft(), initialPayments: { 'group-1': 25, 'group-2': 30 } })).rejects.toBeDefined();
    expect(await snapshot()).toEqual(before);
  });
  it('undoes name edits and withdrawal when adding the replacement group fails', async () => {
    await enrollStudent('student-1', 'group-1', 50);
    const before = await snapshot(), student = await readById('students', 'student-1');
    const failed = failPut('counters', row => Number(row.value) === 2);
    await expect(saveStudent(actor, { id: student!.id, draft: { ...student!, name: 'Should roll back', enrolledGroups: ['group-2'] }, initialPayments: { 'group-2': 20 } })).rejects.toBeDefined();
    expect(failed()).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
  it('preserves newly added memberships during a profile-only edit from an old UI snapshot', async () => {
    await enrollStudent('student-1', 'group-1');
    const previous = (await readById('students', 'student-1'))!;
    await enrollStudent('student-1', 'group-2');
    await saveStudent(actor, { id: previous.id, draft: { ...previous, name: 'Updated name' }, baselineGroupIds: previous.enrolledGroups });
    expect(await readById('students', previous.id)).toMatchObject({ name: 'Updated name', enrolledGroups: ['group-1', 'group-2'], totalOwed: 400 });
  });
  it('requires a fresh review for actual membership edits if the membership baseline changed', async () => {
    await enrollStudent('student-1', 'group-1');
    const previous = (await readById('students', 'student-1'))!;
    await enrollStudent('student-1', 'group-2');
    const before = await snapshot();
    await expect(saveStudent(actor, { id: previous.id, draft: { ...previous, enrolledGroups: [] }, baselineGroupIds: previous.enrolledGroups })).rejects.toThrow('اتغيرت');
    expect(await snapshot()).toEqual(before);
  });
});

describe('complete removal uses every real link, not just denormalized arrays', () => {
  it.each(['student', 'group'] as const)('removes %s links that were missing from BOTH cached membership arrays', async kind => {
    await enrollStudent('student-1', 'group-1', 50);
    const s = (await readById('students', 'student-1'))!, g = (await readById('groups', 'group-1'))!;
    await dbPut('students', { ...s, enrolledGroups: [] }); await dbPut('groups', { ...g, studentIds: [] });
    await dbPut('installments', payrollInstallment({ id: 'fully-paid-history', amount: 10, paidAmount: 10, status: 'paid' }));
    await dbPut('payroll', { id: 'approved-synthetic', gross: 120, paidAmount: 25, items: [{ studentId: s.id, subscriptionAmount: 200 }] });
    await dbPut('expenses', { id: 'linked-synthetic', payrollId: 'approved-synthetic', amount: 25 });
    const history = await readSnapshot(['payments', 'payroll', 'expenses']);
    if (kind === 'student') await deleteStudents(actor, [s.id]); else await deleteCatalogRecord(actor, 'groups', g.id);
    expect((await readAll('enrollments')).every(row => row.status !== 'active')).toBe(true);
    expect((await readAll('installments')).filter(row => row.id !== 'fully-paid-history').every(row => row.status === 'cancelled')).toBe(true);
    expect((await readById('installments', 'fully-paid-history'))?.status).toBe('paid');
    expect(await readSnapshot(['payments', 'payroll', 'expenses'])).toEqual(history);
  });
  it('treats bulk student deletion as one batch, rolling back earlier students on a late failure', async () => {
    await enrollStudent('student-1', 'group-1', 50); await enrollStudent('student-2', 'group-1', 20);
    const before = await snapshot(), failed = failPut('students', row => row.id === 'student-2' && row.deleted === true);
    await expect(deleteStudents(actor, ['student-1', 'student-2'])).rejects.toBeDefined();
    expect(failed()).toBe(true); expect(await snapshot()).toEqual(before); expect(addAuditEntry).not.toHaveBeenCalled();
  });
  it('rolls back all withdrawals if the final group tombstone fails', async () => {
    await enrollStudent('student-1', 'group-1', 50); await enrollStudent('student-2', 'group-1');
    const before = await snapshot(), failed = failPut('groups', row => row.deleted === true);
    await expect(deleteCatalogRecord(actor, 'groups', 'group-1')).rejects.toBeDefined();
    expect(failed()).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it('deduplicates requested IDs and treats missing/already deleted students as no-ops', async () => {
    expect(await deleteStudents(actor, ['student-1', 'student-1', 'missing'])).toEqual({ deleted: 1, warnings: [] });
    expect(await deleteStudents(actor, ['student-1'])).toEqual({ deleted: 0, warnings: [] });
    expect(addAuditEntry).toHaveBeenCalledOnce();
  });
  it.each([false, true])('serializes group removal against a competing enrollment (enrollment first=%s)', async enrollFirst => {
    await enrollStudent('student-1', 'group-1');
    const enroll = () => enrollStudent('student-2', 'group-1', 10), remove = () => deleteCatalogRecord(actor, 'groups', 'group-1');
    const results = enrollFirst ? await Promise.all([enroll(), remove()]) : await Promise.all([remove(), enroll()]);
    const registration = results[enrollFirst ? 0 : 1] as { success: boolean };
    expect(registration.success).toBe(enrollFirst);
    expect(await readById('groups', 'group-1')).toBeUndefined();
    expect((await readAll('enrollments')).filter(row => row.groupId === 'group-1' && row.status === 'active')).toEqual([]);
    expect((await readAll('students')).every(row => !row.enrolledGroups.includes('group-1'))).toBe(true);
  });
  it('rejects a collection queued after deletion rather than leaving money against a deleted student', async () => {
    await enrollStudent('student-1', 'group-1');
    const [, paid] = await Promise.all([deleteStudents(actor, ['student-1']), recordInstallmentPayment({ studentId: 'student-1', amount: 20 })]);
    expect(paid.success).toBe(false); expect(await readAll('payments')).toEqual([]);
  });
  it('denies all composite writes during required password rotation or insufficient permissions', async () => {
    const before = await snapshot();
    await expect(deleteStudents({ ...actor, role: 'secretary' }, ['student-1'])).rejects.toThrow('صلاحية');
    await expect(saveStudent({ ...actor, mustChangePassword: true }, { draft: draft() })).rejects.toThrow('كلمة المرور');
    expect(await snapshot()).toEqual(before);
  });
});


it('keeps the low-level tombstone read/write together, so a queued profile edit cannot resurrect it', async () => {
  const current = (await readById('students', 'student-1'))!;
  const results = await Promise.allSettled([dbSoftDelete('students', current.id), saveStudent(actor, { id: current.id, draft: { ...current, name: 'Too late' } })]);
  expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('rejected');
  expect(await readById('students', current.id)).toBeUndefined();
});
it('keeps school/contact/source metadata in a reopened student draft and does not share the membership array', () => {
  const student = payrollStudent({ school: 'Synthetic school', gradeLevel: 'Synthetic grade', source: 'Synthetic referral', parentName: 'Synthetic parent' });
  const { result } = renderHook(useStudentEditor);
  act(() => { result.current.openEdit(student); });
  expect(result.current.form).toMatchObject({ school: student.school, gradeLevel: student.gradeLevel, source: student.source, parentName: student.parentName });
  expect(result.current.form.enrolledGroups).not.toBe(student.enrolledGroups);
});


it('never overwrites an existing student if a newly generated identifier collides', async () => {
  const before = await snapshot();
  vi.spyOn(ids, 'generateId').mockReturnValueOnce('student-1');
  await expect(saveStudent(actor, { draft: draft([]) })).rejects.toBeDefined();
  expect(await snapshot()).toEqual(before);
});
