import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getDB } from '../data/database';
import { readAll, readById } from '../data/readers';
import { dbPut } from '../data/records';
import { enrollStudent } from '../services/enrollmentService';
import { reviewWriteOff } from '../services/debtWriteOffService';
import { cancelStudentPayment, collectStudentPayment, confirmDebtWriteOff, enrollGroupStudent, refundStudentPayment, removeGroupStudent, renewStudentSubscription, transferGroupStudent } from '../services/commands/studentFinance';
import { addAuditEntry } from '../lib/audit';
import { payrollStudent, payrollGroup, PAYROLL_NOW } from './helpers/payroll';

vi.mock('../lib/audit', () => ({ addAuditEntry: vi.fn() }));
const admin = { id: 'synthetic-admin', username: 'Synthetic Admin', role: 'admin' as const };
const teacher = { ...admin, role: 'teacher' as const, teacherId: 'teacher-1' };
beforeEach(async () => {
  vi.clearAllMocks();
  const db = await getDB(); for (const name of db.objectStoreNames) await db.clear(name);
  await dbPut('students', payrollStudent({ enrolledGroups: [] }));
  await dbPut('groups', payrollGroup({ studentIds: [] }));
  await dbPut('courses', { id: 'course-1', name: 'Synthetic', price: 200, durationMonths: 1, category: 'test', color: '#000000', icon: 'x', levels: [], createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
});
afterEach(() => vi.restoreAllMocks());
const actions = [
  ['collect', () => collectStudentPayment(teacher, { studentId: 'student-1', amount: 20 })],
  ['cancel', () => cancelStudentPayment(teacher, { paymentId: 'missing', reason: 'Synthetic' })],
  ['refund', () => refundStudentPayment(teacher, { studentId: 'student-1', amount: 20, reason: 'Synthetic' })],
  ['enroll', () => enrollGroupStudent(teacher, 'student-1', 'group-1')],
  ['remove', () => removeGroupStudent(teacher, 'student-1', 'group-1')],
  ['renew', () => renewStudentSubscription(teacher, { studentId: 'student-1', groupId: 'group-1' })],
  ['transfer', () => transferGroupStudent(teacher, { studentId: 'student-1', fromGroupId: 'group-1', toGroupId: 'group-2' })],
  ['writeoff', () => confirmDebtWriteOff(teacher, 'all', 'Synthetic', 'تصفير', { today: '2026-09-24', fingerprint: 'synthetic' })],
] as const;
it.each(actions)('requires command-level permission for %s', async (_name, action) => {
  await expect(action()).rejects.toThrow('صلاحية');
  expect(await readAll('payments')).toEqual([]);
  expect(await readAll('enrollments')).toEqual([]);
  expect(addAuditEntry).not.toHaveBeenCalled();
});
it('does not let academic enrollment permissions silently authorize initial collection', async () => {
  const supervisor = { ...admin, role: 'supervisor' as const };
  await expect(enrollGroupStudent(supervisor, 'student-1', 'group-1', 10)).rejects.toThrow('صلاحية');
  expect(await readAll('enrollments')).toEqual([]);
  expect((await enrollGroupStudent(supervisor, 'student-1', 'group-1')).success).toBe(true);
  await expect(renewStudentSubscription(supervisor, { studentId: 'student-1', groupId: 'group-1' })).rejects.toThrow('صلاحية');
});
it('validates write-off confirmation and the reviewed snapshot before a destructive commit', async () => {
  await enrollStudent('student-1', 'group-1');
  const review = await reviewWriteOff('all');
  await expect(confirmDebtWriteOff(admin, 'all', 'Synthetic', '', review)).rejects.toThrow('تصفير');
  expect((await readAll('installments'))[0].status).not.toBe('cancelled');
  expect((await confirmDebtWriteOff(admin, 'all', 'Synthetic', ' تـصـفـيـر ', review)).success).toBe(true);
  expect(addAuditEntry).toHaveBeenCalledWith(expect.objectContaining({ action: 'writeoff', userId: admin.id }));
});
it('uses the authenticated collector and does not misreport a committed payment after audit failure', async () => {
  await enrollStudent('student-1', 'group-1');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(addAuditEntry).mockImplementationOnce(() => { throw new Error('Synthetic audit storage failure'); });
  const result = await collectStudentPayment(admin, { studentId: 'student-1', amount: 25, collectedBy: 'spoofed', collectedByName: 'spoofed' });
  expect(result.success).toBe(true);
  expect((await readAll('payments'))[0]).toMatchObject({ collectedBy: admin.id, collectedByName: admin.username });
  expect((await readById('students', 'student-1'))?.totalPaid).toBe(25);
});
