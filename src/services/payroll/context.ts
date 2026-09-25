import { readSnapshot } from '../../data/readers';
import { calcTeacherPayroll } from '../../domain/payroll/calculate';
import { isPayrollPeriod } from '../../domain/payroll/settings';
import type { PayrollContext, TeacherPayrollCalc } from '../../domain/payroll/types';

export async function loadPayrollContext(period: string): Promise<PayrollContext> {
  if (!isPayrollPeriod(period)) throw new Error('اختر شهراً صحيحاً');
  const { teacher_advances: advances, ...rows } = await readSnapshot([
    'teachers', 'groups', 'enrollments', 'attendance', 'payments', 'teacher_advances', 'installments', 'students',
  ], { includeDeleted: true });
  return { ...rows, advances };
}

/** حساب مستحقات كل المدرسين عن شهر */
export async function calcPayrollForPeriod(period: string, ctx?: PayrollContext): Promise<TeacherPayrollCalc[]> {
  const context = ctx || (await loadPayrollContext(period));
  return context.teachers
    .filter(t => !t.deleted)
    .map(t => calcTeacherPayroll(t, period, context))
    .sort((a, b) => b.net - a.net);
}
