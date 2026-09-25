import { addAuditEntry } from '../lib/audit';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAdd, dbClearStore, dbGetAll, dbGetById, dbPut, dbSoftDelete } from '../data/records';
import { BACKUP_STORES } from '../data/stores';
import type { Course, Payment, PaymentMethod, TeacherStatus } from '../domain/models';
import {
  saveGroup,
  saveTeacher,
  saveCourse,
  saveInventoryItem,
  deleteCatalogRecord,
} from '../services/commands/catalog';
import { saveExpense, deleteExpense } from '../services/commands/expenses';
import { saveExam, saveExamGrades, saveAttendance, checkOutStudent } from '../services/commands/academic';
import { createPayment, markPendingPaymentPaid, deletePendingPayment } from '../services/commands/payments';
import { saveStudent, importStudentCSV } from '../services/commands/students';
import { payrollStudent, payrollTeacher, payrollGroup, payrollInstallment, PAYROLL_NOW } from './helpers/payroll';
import * as ids from '../lib/ids';

// Auditing is tested independently; do not leave fire-and-forget writes between transaction tests.
vi.mock('../lib/audit', () => ({ addAuditEntry: vi.fn() }));
const admin = { id: 'test-admin', username: 'Synthetic admin', role: 'admin' } as const;
const accountant = { id: 'test-accountant', username: 'Synthetic accountant', role: 'accountant' } as const;
const teacher = { id: 'test-teacher', username: 'Synthetic teacher', role: 'teacher', teacherId: 'teacher-1' } as const;
const course: Course = {
  id: 'course-1',
  name: 'Synthetic Course',
  category: 'test',
  price: 200,
  durationMonths: 1,
  levels: [],
  icon: '📘',
  color: '#6366f1',
  sessionsPerMonth: 8,
  createdAt: PAYROLL_NOW,
  updatedAt: PAYROLL_NOW,
};
const expense = { category: 'rent', description: 'Synthetic rent', amount: 100, date: '2026-09-24' } as const;
const exam = {
  id: 'exam-1',
  groupId: 'group-1',
  name: 'Synthetic exam',
  date: '2026-09-24',
  maxGrade: 100,
  createdAt: PAYROLL_NOW,
  updatedAt: PAYROLL_NOW,
};

beforeEach(async () => {
  for (const store of [...BACKUP_STORES, 'settings', 'users'] as const) await dbClearStore(store);
  await dbAdd('teachers', payrollTeacher());
  await dbAdd('courses', course);
  await dbAdd('groups', payrollGroup());
  await dbAdd('students', payrollStudent());
  await dbAdd('enrollments', {
    id: 'enrollment-1',
    groupId: 'group-1',
    studentId: 'student-1',
    status: 'active',
    enrolledAt: '2026-09-01',
  });
  await dbAdd('installments', payrollInstallment());
  await dbAdd('exams', exam);
});
afterEach(() => vi.restoreAllMocks());

describe('catalog command boundary', () => {
  it.each(['active', 'vacation', 'suspended'] as TeacherStatus[])(
    'retains teacher status %s and the negotiated rate',
    async status => {
      await saveTeacher(admin, { ...payrollTeacher(), status }, 'teacher-1');
      expect(await dbGetById('teachers', 'teacher-1')).toMatchObject({
        status,
        payModel: 'subscription_percentage',
        payRate: 60,
      });
    },
  );
  it('academic updates can preserve a more recent financial agreement', async () => {
    const old = payrollTeacher();
    await dbPut('teachers', { ...old, payRate: 75 });
    await saveTeacher(admin, { ...old, name: 'Updated academic name' }, old.id, false);
    expect(await dbGetById('teachers', old.id)).toMatchObject({ payRate: 75, name: 'Updated academic name' });
  });
  it('uses fresh group membership, not the editing snapshot', async () => {
    const original = payrollGroup();
    await dbPut('groups', { ...original, studentIds: ['student-1', 'new-member'] });
    await saveGroup(admin, { ...original, name: 'Updated group' }, original.id);
    expect(await dbGetById('groups', original.id)).toMatchObject({
      name: 'Updated group',
      studentIds: ['student-1', 'new-member'],
    });
  });
  it('blocks linked teacher/course deletion even when the UI snapshot is stale', async () => {
    await expect(deleteCatalogRecord(admin, 'teachers', 'teacher-1')).rejects.toThrow('مجموعة');
    await expect(deleteCatalogRecord(admin, 'courses', 'course-1')).rejects.toThrow('مجموعة');
    expect(await dbGetById('teachers', 'teacher-1')).toBeDefined();
  });
  it('rejects writes without permission and never resurrects a deleted catalog row', async () => {
    await expect(saveGroup(teacher, payrollGroup(), 'group-1')).rejects.toThrow('صلاحية');
    await dbSoftDelete('teachers', 'teacher-1');
    await expect(saveTeacher(admin, payrollTeacher(), 'teacher-1')).rejects.toThrow('غير موجود');
  });
  it('rejects NaN, infinite and invalid inventory/course values before any writes', async () => {
    await expect(saveCourse(admin, { ...course, price: NaN }, course.id)).rejects.toThrow('المبلغ');
    await expect(
      saveInventoryItem(accountant, { name: 'Synthetic', type: 'book', costPrice: 10, sellPrice: Infinity, stock: 1 }),
    ).rejects.toThrow('المبلغ');
    await expect(
      saveInventoryItem(accountant, { name: 'Synthetic', type: 'book', costPrice: 10, sellPrice: 15, stock: -1 }),
    ).rejects.toThrow('الكمية');
    expect(await dbGetAll('inventory')).toEqual([]);
    expect((await dbGetById('courses', course.id))?.price).toBe(200);
  });
  it('does not change approved subscription installments when editing catalog prices', async () => {
    await saveCourse(admin, { ...course, price: 400 }, course.id);
    expect((await dbGetById('installments', 'installment-1'))?.amount).toBe(200);
  });
});

describe('expense protection at the mutation boundary', () => {
  it('blocks updates/deletion of linked salary expenses based on the fresh row', async () => {
    const row = await saveExpense(accountant, expense);
    await dbPut('expenses', { ...row, payrollId: 'approved-payroll' });
    await expect(saveExpense(accountant, { ...expense, amount: 50 }, row.id)).rejects.toThrow('مرتبط');
    await expect(deleteExpense(admin, row.id)).rejects.toThrow('مرتبط');
    expect((await dbGetById('expenses', row.id))?.amount).toBe(100);
  });
  it('ignores attempts to forge linking/tombstone metadata through a draft', async () => {
    const malicious = { ...expense, id: 'spoofed', payrollId: 'fake', deleted: true };
    const row = await saveExpense(accountant, malicious);
    expect(row.id).not.toBe('spoofed');
    expect(row).not.toHaveProperty('payrollId');
    expect(row.deleted).not.toBe(true);
  });
  it('validates dates, amounts and authorization', async () => {
    await expect(saveExpense(teacher, expense)).rejects.toThrow('صلاحية');
    await expect(saveExpense(admin, { ...expense, date: '2026-02-31' })).rejects.toThrow('التاريخ');
    await expect(saveExpense(admin, { ...expense, amount: 0.001 })).rejects.toThrow('منزلتين');
    expect(await dbGetAll('expenses')).toEqual([]);
  });
});

describe('academic transaction boundaries', () => {
  it('rejects the entire grade batch if any grade is invalid', async () => {
    await dbAdd('students', payrollStudent({ id: 'student-2' }));
    await dbAdd('enrollments', { id: 'enrollment-2', groupId: 'group-1', studentId: 'student-2', status: 'active' });
    await expect(saveExamGrades(teacher, exam.id, { 'student-1': 90, 'student-2': 101 })).rejects.toThrow('الدرجة');
    expect(await dbGetAll('grades')).toEqual([]);
    await expect(saveExamGrades(teacher, exam.id, { 'student-1': NaN })).rejects.toThrow('الدرجة');
  });
  it('serializes concurrent grade saves without creating duplicates', async () => {
    await Promise.all([
      saveExamGrades(teacher, exam.id, { 'student-1': 80 }),
      saveExamGrades(teacher, exam.id, { 'student-1': 90 }),
    ]);
    const rows = await dbGetAll('grades');
    expect(rows).toHaveLength(1);
    expect(rows[0].grade).toBe(90);
  });
  it('enforces teacher ownership for exams, attendance and checkout', async () => {
    const other = { ...teacher, teacherId: 'not-the-owner' };
    await expect(saveExam(other, exam, exam.id)).rejects.toThrow('صلاحية');
    await expect(saveExamGrades(other, exam.id, { 'student-1': 50 })).rejects.toThrow('صلاحية');
    await expect(
      saveAttendance(other, { groupId: 'group-1', date: '2026-09-24', studentIds: ['student-1'], statuses: {} }),
    ).rejects.toThrow('صلاحية');
    await dbAdd('attendance', {
      id: 'attendance-1',
      groupId: 'group-1',
      studentId: 'student-1',
      date: '2026-09-24',
      status: 'present',
    });
    await expect(checkOutStudent(other, 'attendance-1')).rejects.toThrow('صلاحية');
  });
  it('keeps later joiners out of historic absences and preserves checkout on edits', async () => {
    await dbPut('enrollments', {
      id: 'enrollment-1',
      groupId: 'group-1',
      studentId: 'student-1',
      status: 'active',
      enrolledAt: '2026-09-20',
    });
    const submitted = { groupId: 'group-1', date: '2026-09-10', studentIds: ['student-1'], statuses: {} };
    expect((await saveAttendance(teacher, submitted)).savedCount).toBe(0);
    await dbAdd('attendance', {
      id: 'historic',
      groupId: 'group-1',
      studentId: 'student-1',
      date: submitted.date,
      status: 'present',
      checkOutTime: '12:00',
      createdAt: PAYROLL_NOW,
    });
    await saveAttendance(teacher, { ...submitted, statuses: { 'student-1': 'late' } });
    expect(await dbGetById('attendance', 'historic')).toMatchObject({ status: 'late', checkOutTime: '12:00' });
  });
  it('does not mark newly enrolled, unseen students absent from a stale form', async () => {
    await dbAdd('students', payrollStudent({ id: 'student-2' }));
    await dbAdd('enrollments', { id: 'enrollment-2', groupId: 'group-1', studentId: 'student-2', status: 'active' });
    await expect(
      saveAttendance(teacher, { groupId: 'group-1', date: '2026-09-24', studentIds: ['student-1'], statuses: {} }),
    ).rejects.toThrow('تغيرت');
    expect(await dbGetAll('attendance')).toEqual([]);
  });
  it('rolls back all attendance rows when a later write fails', async () => {
    await dbAdd('students', payrollStudent({ id: 'student-2' }));
    await dbAdd('enrollments', { id: 'enrollment-2', groupId: 'group-1', studentId: 'student-2', status: 'active' });
    vi.spyOn(ids, 'generateId')
      .mockReturnValueOnce('first')
      .mockImplementationOnce(() => {
        throw new Error('synthetic failure');
      });
    await expect(
      saveAttendance(teacher, {
        groupId: 'group-1',
        date: '2026-09-24',
        studentIds: ['student-1', 'student-2'],
        statuses: {},
      }),
    ).rejects.toThrow('synthetic');
    expect(await dbGetAll('attendance')).toEqual([]);
  });
});

describe('payment command boundaries', () => {
  function pending(): Payment {
    return {
      id: 'pending',
      studentId: 'student-1',
      amount: 100,
      type: 'subscription',
      status: 'pending',
      date: '2026-09-01',
      createdAt: PAYROLL_NOW,
      updatedAt: PAYROLL_NOW,
    };
  }
  it('issues only one receipt when the same pending payment is collected concurrently', async () => {
    await dbAdd('payments', pending());
    const results = await Promise.all([
      markPendingPaymentPaid(accountant, 'pending', 'TEST'),
      markPendingPaymentPaid(accountant, 'pending', 'TEST'),
    ]);
    expect(results.filter(result => result.changed)).toHaveLength(1);
    expect((await dbGetAll('counters'))[0].value).toBe(1);
    expect((await dbGetById('payments', 'pending'))?.receiptNo).toMatch(/^TEST-\d{4}-0001$/);
    expect((await dbGetById('installments', 'installment-1'))?.paidAmount).toBe(100);
  });
  it('does not turn a stale voided/deleted payment into money', async () => {
    await dbAdd('payments', { ...pending(), voided: true });
    await expect(markPendingPaymentPaid(accountant, 'pending')).rejects.toThrow('ملغاة');
    await dbSoftDelete('payments', 'pending');
    await expect(markPendingPaymentPaid(accountant, 'pending')).rejects.toThrow('غير موجود');
    expect(await dbGetAll('counters')).toEqual([]);
  });
  it('rolls the receipt counter back if payment persistence fails', async () => {
    vi.spyOn(ids, 'generateId').mockImplementationOnce(() => {
      throw new Error('synthetic failure');
    });
    await expect(createPayment(accountant, { ...pending(), status: 'paid', type: 'books' }, 'TEST')).rejects.toThrow(
      'synthetic',
    );
    expect(await dbGetAll('payments')).toEqual([]);
    expect(await dbGetAll('counters')).toEqual([]);
  });
  it.each(['cash', 'wallet', 'instapay', 'card', 'bank', 'other'] as PaymentMethod[])(
    'preserves method %s',
    async method => {
      const result = await createPayment(accountant, { ...pending(), method, type: 'books', status: 'paid' });
      expect(result.payment.method).toBe(method);
    },
  );
  it('never soft-deletes a collected payment, and validates nonfinite/invalid input', async () => {
    await dbAdd('payments', { ...pending(), status: 'paid' });
    await expect(deletePendingPayment(accountant, 'pending')).rejects.toThrow('إلغاء');
    await expect(createPayment(accountant, { ...pending(), amount: Infinity })).rejects.toThrow('المبلغ');
    await expect(createPayment(accountant, { ...pending(), date: '2026-02-30' })).rejects.toThrow('التاريخ');
  });
});

describe('student command orchestration', () => {
  it('updates profile fields without replacing a fresher ledger or allowing tombstone injection', async () => {
    const current = payrollStudent({ totalPaid: 55, totalOwed: 200 });
    await dbPut('students', current);
    await saveStudent(admin, {
      id: current.id,
      draft: { ...current, name: 'Updated synthetic', totalPaid: 999, deleted: true } as typeof current,
    });
    expect(await dbGetById('students', current.id)).toMatchObject({
      name: 'Updated synthetic',
      totalPaid: 55,
      totalOwed: 200,
    });
  });
  it('uses the existing enrollment/proration/payment path for new memberships', async () => {
    const draft = payrollStudent({ enrolledGroups: ['group-1'] });
    const result = await saveStudent(admin, {
      draft,
      initialPayments: { 'group-1': 75 },
      startSessions: { 'group-1': 5 },
    });
    const bills = (await dbGetAll('installments')).filter(row => row.studentId === result.student.id);
    expect(bills[0].amount).toBe(100);
    expect((await dbGetAll('payments')).find(row => row.studentId === result.student.id)?.amount).toBe(75);
    expect(result.warnings).toEqual([]);
  });
  it('rejects unauthorized initial collection before creating any student', async () => {
    const supervisor = { ...admin, role: 'supervisor' } as const;
    await expect(
      saveStudent(supervisor, { draft: payrollStudent(), initialPayments: { 'group-1': 1 } }),
    ).rejects.toThrow('صلاحية');
    expect(await dbGetAll('students')).toHaveLength(1);
  });
  it('checks fresh group capacity and reports partial enrollment without false links', async () => {
    await dbPut('groups', payrollGroup({ maxStudents: 1 }));
    await expect(saveStudent(admin, { draft: payrollStudent() })).rejects.toThrow('مكتملة');
    expect(await dbGetAll('students')).toHaveLength(1);
  });
  it('reuses validation for the legacy CSV import instead of bypassing form rules', async () => {
    const csv =
      'الاسم,العمر,النوع,هاتف,ولي الأمر,الحالة\nSynthetic Valid,10,male,,01000000000,active\nSynthetic Invalid,90,male,,01000000000,active';
    expect(await importStudentCSV(admin, csv)).toEqual({ imported: 1, errors: 1 });
  });
  it('blocks commands while a forced password change is outstanding', async () => {
    await expect(saveExpense({ ...admin, mustChangePassword: true }, expense)).rejects.toThrow('كلمة المرور');
  });
});

it('never turns a committed write into a retryable save failure because audit logging failed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(addAuditEntry).mockImplementationOnce(() => {
    throw new Error('audit unavailable');
  });
  const saved = await saveExpense(accountant, expense);
  expect(await dbGetById('expenses', saved.id)).toMatchObject({ amount: 100 });
});
