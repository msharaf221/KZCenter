import dayjs from 'dayjs';
import { readByIndex, readSnapshot } from '../data/readers';
import { debtorRows, orderedInstallments, studentBalance } from '../domain/ledger/balance';
import type { StudentBalance } from '../domain/ledger/types';
import { withBillingTransaction } from './billing/unitOfWork';
export type { DebtorRow, GroupBalance, StudentBalance } from '../domain/ledger/types';

/** Debtor totals share one committed snapshot, independent of the number of students. */
export async function getDebtors() {
  return debtorRows(await readSnapshot(['students', 'payments', 'refunds', 'installments', 'groups', 'courses']), new Date().toISOString());
}
export async function getStudentInstallments(studentId: string) {
  return orderedInstallments(await readByIndex('installments', 'by-studentId', studentId), dayjs().format('YYYY-MM-DD'));
}
export async function getStudentBalance(studentId: string): Promise<StudentBalance | null> {
  const data = await readSnapshot(['students', 'payments', 'refunds', 'installments', 'groups', 'courses']);
  const student = data.students.find(row => row.id === studentId);
  if (!student) return null;
  return studentBalance(student, {
    installments: data.installments.filter(row => row.studentId === studentId),
    payments: data.payments.filter(row => row.studentId === studentId), refunds: data.refunds.filter(row => row.studentId === studentId), enrollments: []
  },
    data.groups, data.courses, dayjs().format('YYYY-MM-DD'));
}
export function recalculateStudentTotalPaid(studentId: string): Promise<void> {
  return withBillingTransaction(unit => unit.recalculate(studentId));
}
export function getStudentRefunds(studentId: string) { return readByIndex('refunds', 'by-studentId', studentId); }
