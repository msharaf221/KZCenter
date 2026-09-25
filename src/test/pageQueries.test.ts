import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as readers from '../data/readers';
import { dbAdd, dbBulkAdd, dbClearStore, dbGetById, dbPut } from '../data/records';
import type { Attendance, Course, Expense, Payment, Refund } from '../domain/models';
import { loadStudentsList, type StudentListQuery } from '../services/queries/students';
import { loadTeachersList } from '../services/queries/teachers';
import { loadCoursesCatalog } from '../services/queries/courses';
import { loadGroupsCatalog } from '../services/queries/groups';
import { loadPaymentsList } from '../services/queries/payments';
import { loadExpensesList } from '../services/queries/expenses';
import { loadDailyReportData } from '../services/queries/dailyReports';
import { loadReportData } from '../services/queries/reports';
import { loadDashboardData } from '../services/queries/dashboard';
import { loadPayrollPage } from '../services/queries/payroll';
import { SUBJECTS } from '../lib/subjects';
import { setSettingsCache } from '../lib/settings';
import * as maintenance from '../services/maintenanceService';
import { runStartupMaintenance } from '../services/startupMaintenance';
import { payrollGroup, payrollInstallment, payrollStudent, payrollTeacher } from './helpers/payroll';

const today = '2026-09-24';
const now = `${today}T10:00:00Z`;
const subject = SUBJECTS[0];
const filters: StudentListQuery = {
  page: 1,
  pageSize: 20,
  search: '',
  statusFilter: '',
  groupFilter: '',
  courseFilter: '',
  balanceFilter: '',
  attendanceFilter: '',
  role: 'admin',
};

function course(id: string, name: string): Course {
  return {
    id,
    name,
    price: 200,
    subjectId: subject.id,
    category: 'test',
    durationMonths: 1,
    levels: [],
    icon: '📘',
    color: '#6366f1',
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  localStorage.clear();
  setSettingsCache(null);
  for (const store of [
    'students',
    'teachers',
    'courses',
    'groups',
    'attendance',
    'payments',
    'refunds',
    'expenses',
    'installments',
    'enrollments',
    'settings',
    'teacher_advances',
    'payroll',
  ] as const)
    await dbClearStore(store);
  await dbBulkAdd('students', [
    payrollStudent({
      id: 's1',
      name: 'Alpha Student',
      parentPhone: '00000000001',
      enrolledGroups: ['g1'],
      totalOwed: 200,
      totalPaid: 20,
      createdAt: '2026-09-01',
    }),
    payrollStudent({
      id: 's2',
      name: 'Beta Student',
      parentPhone: '00000000002',
      enrolledGroups: ['g2'],
      status: 'suspended',
      totalOwed: 300,
      createdAt: '2026-09-02',
    }),
    payrollStudent({
      id: 's3',
      name: 'Gamma Student',
      enrolledGroups: ['g1'],
      totalOwed: 100,
      totalPaid: 100,
      createdAt: '2026-09-03',
    }),
    payrollStudent({ id: 's4', name: 'Ended Student', enrolledGroups: [], status: 'ended', createdAt: '2026-09-04' }),
    payrollStudent({ id: 'removed', name: 'Deleted Student', deleted: true, createdAt: '2026-09-05' }),
  ]);
  await dbBulkAdd('teachers', [
    payrollTeacher({ id: 't1', name: 'Teacher Alpha', specialization: 'Test', subjectIds: [subject.id] }),
    payrollTeacher({ id: 't2', name: 'Teacher Beta', specialization: 'Other', payRate: 40 }),
  ]);
  await dbBulkAdd('courses', [course('c1', 'Course Alpha'), course('c2', 'Course Beta')]);
  await dbBulkAdd('groups', [
    payrollGroup({
      id: 'g1',
      name: 'Group Alpha',
      teacherId: 't1',
      courseId: 'c1',
      studentIds: ['s1', 's3'],
      schedule: [{ days: ['thursday'], startTime: '09:00', endTime: '10:00' }],
    }),
    payrollGroup({
      id: 'g2',
      name: 'Group Beta',
      teacherId: 't2',
      courseId: 'c2',
      studentIds: ['s2'],
      schedule: [{ days: ['thursday'], startTime: '11:00', endTime: '12:00' }],
    }),
  ]);
  const attendance: Attendance[] = [21, 22, 23].map(day => ({
    id: `absent-${day}`,
    studentId: 's1',
    groupId: 'g1',
    date: `2026-09-${day}`,
    status: 'absent',
    createdAt: now,
    updatedAt: now,
  }));
  attendance.push(
    { ...attendance[0], id: 'present-today', status: 'present', date: today },
    { ...attendance[0], id: 'other-group', studentId: 's2', groupId: 'g2', date: today },
    { ...attendance[0], id: 'present-gamma', studentId: 's3', status: 'present', date: '2026-09-20' },
  );
  await dbBulkAdd('attendance', attendance);
  const payment: Payment = {
    id: 'p-alpha',
    studentId: 's1',
    groupId: 'g1',
    amount: 100,
    type: 'subscription',
    status: 'paid',
    date: today,
    receiptNo: 'TEST-001',
    collectedBy: 'test-user',
    collectedByName: 'Collector Alpha',
    createdAt: now,
    updatedAt: now,
  };
  await dbBulkAdd('payments', [
    payment,
    {
      ...payment,
      id: 'p-beta',
      studentId: 's2',
      groupId: 'g2',
      amount: 200,
      status: 'pending',
      date: '2026-09-23',
      receiptNo: undefined,
      collectedByName: 'Collector Beta',
    },
    { ...payment, id: 'p-void', amount: 999, voided: true, receiptNo: 'VOID-001' },
    { ...payment, id: 'p-missing', amount: 50, studentId: 'missing', receiptNo: 'ORPHAN-001' },
    { ...payment, id: 'p-old', amount: 80, date: '2026-08-15', receiptNo: 'OLD-001' },
    { ...payment, id: 'p-deleted', amount: 777, deleted: true },
  ]);
  await dbAdd<Refund>('refunds', {
    id: 'r1',
    studentId: 's1',
    paymentId: payment.id,
    amount: 20,
    method: 'cash',
    date: today,
    reason: 'test',
    createdAt: now,
    updatedAt: now,
  });
  await dbBulkAdd<Expense>('expenses', [
    { id: 'e1', amount: 50, description: 'Rent test', category: 'rent', date: today, createdAt: now, updatedAt: now },
    {
      id: 'e2',
      amount: 30,
      description: 'Salary test',
      category: 'salaries',
      payrollId: 'test-snapshot',
      teacherId: 't1',
      date: '2026-08-15',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await dbBulkAdd('installments', [
    payrollInstallment({
      id: 'i1',
      studentId: 's1',
      groupId: 'g1',
      amount: 200,
      paidAmount: 20,
      dueDate: '2026-09-01',
    }),
    payrollInstallment({
      id: 'i2',
      studentId: 's3',
      groupId: 'g1',
      amount: 100,
      paidAmount: 100,
      status: 'paid',
      dueDate: '2026-09-01',
    }),
    payrollInstallment({ id: 'i3', studentId: 's2', groupId: 'g2', amount: 300, dueDate: '2026-09-01' }),
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('student list query', () => {
  it('preserves newest-first pagination and total without duplicate store reads', async () => {
    const read = vi.spyOn(readers, 'readAll');
    const data = await loadStudentsList({ ...filters, page: 2, pageSize: 2 });
    expect(data.students.map(s => s.id)).toEqual(['s2', 's1']);
    expect(data.total).toBe(4);
    expect(data.allStudents).toHaveLength(4);
    expect(read.mock.calls.filter(([store]) => store === 'students')).toHaveLength(1);
  });

  it('combines all academic, balance and attendance filters', async () => {
    const data = await loadStudentsList({
      ...filters,
      search: 'alpha',
      statusFilter: 'active',
      groupFilter: 'g1',
      courseFilter: 'c1',
      balanceFilter: 'debt',
      attendanceFilter: 'repeat',
    });
    expect(data.students.map(s => s.id)).toEqual(['s1']);
    expect(data.attStatsById.s1).toEqual({ total: 4, absent: 3 });
  });

  it('retains phone search, settled-balance and no-attendance filtering', async () => {
    expect((await loadStudentsList({ ...filters, search: '00000000002' })).students.map(s => s.id)).toEqual(['s2']);
    expect((await loadStudentsList({ ...filters, balanceFilter: 'settled' })).students.map(s => s.id)).toEqual([
      's4',
      's3',
    ]);
    expect((await loadStudentsList({ ...filters, attendanceFilter: 'none' })).students.map(s => s.id)).toEqual(['s4']);
  });

  it('limits the teacher view to that teacher’s groups/students, and an unlinked teacher sees none', async () => {
    const data = await loadStudentsList({ ...filters, role: 'teacher', teacherId: 't2' });
    expect(data.students.map(s => s.id)).toEqual(['s2']);
    expect(data.groups.map(g => g.id)).toEqual(['g2']);
    expect((await loadStudentsList({ ...filters, role: 'teacher' })).students).toEqual([]);
  });
});

describe('catalog queries', () => {
  it('searches teacher subjects and shares course/teacher membership counting', async () => {
    const teachers = await loadTeachersList({ page: 1, pageSize: 20, search: subject.name });
    expect(teachers.teachers.map(t => t.id)).toEqual(['t1']);
    expect(teachers.groupCounts).toEqual({ t1: 1, t2: 1 });
    expect(teachers.studentCounts.t1).toBe(2);
    const courses = await loadCoursesCatalog({ search: 'ALPHA' });
    expect(courses.courses.map(c => c.id)).toEqual(['c1']);
    expect(courses.studentCounts.c1).toBe(2);
  });

  it('preserves legacy group subject fallback and member cleanup', async () => {
    const group = (await dbGetById('groups', 'g1'))!;
    await dbPut('groups', { ...group, studentIds: [...group.studentIds, 'removed', 'missing', 's4'] });
    const data = await loadGroupsCatalog({ search: 'alpha', subjectFilter: subject.id });
    expect(data.groups.map(g => g.id)).toEqual(['g1']);
    // Ended students are not deleted; the historic cleanup only removes missing/deleted rows.
    expect(data.groups[0].studentIds).toEqual(['s1', 's3', 's4']);
    expect((await dbGetById('groups', 'g1'))?.studentIds).toEqual(['s1', 's3', 's4']);
  });
});

describe('financial read models', () => {
  it.each(['TEST-001', '  TEST-001  ', '100'])('retains receipt/amount search: %s', async search => {
    const data = await loadPaymentsList({ page: 1, pageSize: 20, search, statusFilter: '' });
    expect(data.payments.map(p => p.id)).toEqual(['p-alpha']);
  });

  it('supports status/collector filters and keeps orphan receipts searchable', async () => {
    const data = await loadPaymentsList({ page: 1, pageSize: 20, search: 'collector beta', statusFilter: 'pending' });
    expect(data.payments.map(p => p.id)).toEqual(['p-beta']);
    expect(
      (await loadPaymentsList({ page: 1, pageSize: 20, search: 'ORPHAN-001', statusFilter: '' })).payments.map(
        p => p.id,
      ),
    ).toEqual(['p-missing']);
  });

  it('keeps expense summary data independent of table filters and retains salary linkage', async () => {
    const read = vi.spyOn(readers, 'readAll');
    const data = await loadExpensesList({ page: 1, pageSize: 20, search: 'salary', categoryFilter: 'salaries' });
    expect(data.expenses.map(e => e.id)).toEqual(['e2']);
    expect(data.expenses[0].payrollId).toBe('test-snapshot');
    expect(data.allExpenses).toHaveLength(2);
    expect(read.mock.calls.filter(([store]) => store === 'expenses')).toHaveLength(1);
  });

  it('builds the daily table and comparisons from one read set', async () => {
    const read = vi.spyOn(readers, 'readSnapshot');
    const data = await loadDailyReportData({ selectedDate: today });
    expect(data.payments.map(p => p.id).sort()).toEqual(['p-alpha', 'p-missing', 'p-void']);
    expect(data.allPayments).toHaveLength(5);
    expect(data.expenses.map(e => e.id)).toEqual(['e1']);
    expect(data.allRefunds.reduce((sum, r) => sum + r.amount, 0)).toBe(20);
    expect(read).toHaveBeenCalledExactlyOnceWith(['payments', 'expenses', 'refunds', 'students', 'courses']);
  });

  it('retains report inputs and the subscription-based payroll read model', async () => {
    const report = await loadReportData();
    expect(report.students).toHaveLength(4);
    expect(report.installments).toHaveLength(3);
    const payroll = await loadPayrollPage('2026-09');
    expect((payroll.context.installments || []).reduce((sum, i) => sum + i.amount, 0)).toBe(600);
    expect(payroll.records).toEqual([]);
    expect(payroll.expenses).toHaveLength(2);
  });

  it('preserves dashboard net collections, growth, today’s schedule and scoped attendance', async () => {
    const data = await loadDashboardData({ role: 'admin' });
    expect(data.stats).toMatchObject({
      activeStudents: 2,
      totalRevenue: 210,
      pendingPayments: 1,
      pendingAmount: 200,
      growthRate: 62.5,
    });
    expect(data.todayKey).toBe('thursday');
    expect(data.todayAttendance).toMatchObject({ present: 1, absent: 1, recordedGroups: 2 });
    const scoped = await loadDashboardData({ role: 'teacher', teacherId: 't1' });
    expect(scoped.todayGroups.map(g => g.id)).toEqual(['g1']);
    expect(scoped.recentStudents.map(s => s.id)).toEqual(['s3', 's1']);
    expect(scoped.todayAttendance).toMatchObject({ present: 1, absent: 0, recordedGroups: 1 });
  });
});

describe('startup maintenance coordination', () => {
  it('shares an in-flight run and preserves the old once-only migration flags', async () => {
    const migrate = vi.spyOn(maintenance, 'migrateInstallments');
    const overdue = vi.spyOn(maintenance, 'markOverdueInstallments');
    const first = runStartupMaintenance();
    const second = runStartupMaintenance();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(migrate).toHaveBeenCalledOnce();
    expect(overdue).toHaveBeenCalledOnce();
    expect(localStorage.getItem('migration_installments_v1')).toBe('true');
    expect(localStorage.getItem('migration_balances_v1')).toBe('true');
    await runStartupMaintenance();
    expect(migrate).toHaveBeenCalledOnce();
    expect(overdue).toHaveBeenCalledTimes(2);
  });

  it('allows retry after a failed run without incorrectly marking later phases complete', async () => {
    vi.spyOn(maintenance, 'markOverdueInstallments').mockRejectedValueOnce(new Error('temporary failure'));
    await expect(runStartupMaintenance()).rejects.toThrow('temporary failure');
    expect(localStorage.getItem('migration_balances_v1')).toBeNull();
    await expect(runStartupMaintenance()).resolves.toBeUndefined();
    expect(localStorage.getItem('migration_balances_v1')).toBe('true');
  });
});
