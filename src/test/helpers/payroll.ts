import { dbAdd, type Group, type Installment, type Student, type Teacher } from '../../lib/db';
import type { PayrollContext } from '../../lib/payroll';

export const PAYROLL_PERIOD = '2026-09';
export const PAYROLL_NOW = '2026-09-01T09:00:00.000Z';

export function payrollTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: 'teacher-1', name: 'مدرس رياضيات تجريبي', specialization: 'رياضيات', phone: '01000000000',
    salary: 0, payModel: 'subscription_percentage', payRate: 60, status: 'active',
    createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides,
  };
}

export function payrollGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1', name: 'مجموعة رياضيات تجريبية', teacherId: 'teacher-1', courseId: 'course-1',
    schedule: [], studentIds: ['student-1'], maxStudents: 20, status: 'open',
    createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides,
  };
}

export function payrollStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1', name: 'طالب تجريبي أول', age: 10, gender: 'male', parentPhone: '01000000000',
    enrolledGroups: ['group-1'], totalPaid: 0, status: 'active',
    createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides,
  };
}

export function payrollInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: 'installment-1', studentId: 'student-1', groupId: 'group-1', enrollmentId: 'enrollment-1',
    amount: 200, paidAmount: 0, status: 'pending', dueDate: `${PAYROLL_PERIOD}-01`, periodIndex: 1, periodLabel: 'اشتراك سبتمبر',
    createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides,
  };
}

export function payrollContext(overrides: Partial<PayrollContext> = {}): PayrollContext {
  return {
    teachers: [payrollTeacher()], groups: [payrollGroup()], students: [payrollStudent()],
    installments: [payrollInstallment()], enrollments: [], attendance: [], payments: [], advances: [],
    ...overrides,
  };
}

export async function seedPayroll(period = PAYROLL_PERIOD) {
  const teacher = payrollTeacher();
  await dbAdd('teachers', teacher);
  await dbAdd('groups', payrollGroup());
  await dbAdd('students', payrollStudent());
  await dbAdd('installments', payrollInstallment({ dueDate: `${period}-01` }));
  return teacher;
}
