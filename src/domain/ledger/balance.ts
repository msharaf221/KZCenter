import dayjs from 'dayjs';
import { computeBalance, creditOf, installmentState, isCountedPayment, summarize, type Installment } from '../../lib/billing';
import type { Course, Group, Student } from '../models';
import type { DebtorRow, GroupBalance, LedgerSnapshot, StudentBalance, StudentLedger } from './types';

export function orderedInstallments(items: Installment[], today: string): Installment[] {
  return items.filter(row => !row.deleted).slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.periodIndex - b.periodIndex)
    .map(row => ({ ...row, status: installmentState(row, today) }));
}

/** Presentation is installment-led, including the historic no-installments behavior. */
export function studentBalance(student: Student, ledger: StudentLedger, groups: Group[], courses: Course[], today: string): StudentBalance {
  const installments = orderedInstallments(ledger.installments, today);
  const payments = ledger.payments.filter(row => !row.deleted);
  const refunds = ledger.refunds.filter(row => !row.deleted);
  const overall = computeBalance({ installments, payments, refunds });
  const overallSummary = summarize(installments, today);
  const refundedTotal = refunds.reduce((s, r) => s + (r.amount || 0), 0);

  // الأقساط الملغاة (تحويل/خروج من مجموعة) ما تظهرش في المستحقات
  const visible = installments.filter(i => i.status !== 'cancelled');
  const byGroup = new Map<string, Installment[]>();
  for (const inst of visible) {
    const list = byGroup.get(inst.groupId);
    if (list) list.push(inst);
    else byGroup.set(inst.groupId, [inst]);
  }

  const groupBalances: GroupBalance[] = Array.from(byGroup.entries())
    .map(([groupId, list]) => {
      const s = summarize(list, today);
      const group = groups.find(g => g.id === groupId);
      const course = group ? courses.find(c => c.id === group.courseId) : undefined;
      return {
        groupId,
        groupName: group?.name || 'مجموعة محذوفة',
        courseName: course?.name || '—',
        owed: s.total,
        paid: s.paid,
        remaining: s.remaining,
        unpaidCount: s.unpaidCount,
        overdueCount: s.overdueCount,
        overdueAmount: s.overdueAmount,
        installments: list,
      };
    })
    .sort((a, b) => b.remaining - a.remaining);

  return {
    studentId: student.id,
    studentName: student.name,
    owed: overall.owed,
    paid: overall.paid,
    remaining: overall.remaining,
    unpaidCount: overallSummary.unpaidCount,
    overdueCount: overallSummary.overdueCount,
    overdueAmount: overallSummary.overdueAmount,
    credit: creditOf(overall),
    refunded: Math.round(refundedTotal * 100) / 100,
    groups: groupBalances,
  };
}

/** Denormalized legacy totals retain their pre-migration catalog fallback; view balances do not. */
export function storedStudentTotals(student: Student, ledger: StudentLedger, groups: Group[], courses: Course[]) {
  const { payments, refunds, enrollments } = ledger;
  if (ledger.installments.length) return computeBalance(ledger);
  let totalOwed = 0;
  const activeGroupIds = enrollments.filter(e => e.status === 'active' && !e.deleted).map(e => e.groupId);

  // If no enrollments exist yet (legacy data), use enrolledGroups
  const groupIds = activeGroupIds.length > 0 ? activeGroupIds : student.enrolledGroups || [];

  if (groupIds.length > 0) {

    for (const groupId of groupIds) {
      const group = groups.find(g => g.id === groupId);
      if (group && !group.deleted) {
        const course = courses.find(c => c.id === group.courseId);
        if (course) {
          // شهر بشهر: المطلوب = سعر شهر واحد
          totalOwed += course.price;
        }
      }
    }
  }

  const extraOwed = payments
    .filter(p => p.type !== 'subscription' && !p.deleted && !p.voided)
    .reduce((sum, p) => sum + p.amount, 0);
  totalOwed += extraOwed;

  const grossPaid = payments.filter(isCountedPayment).reduce((sum, p) => sum + p.amount, 0);
  // الاستردادات تقلّل المدفوع الفعلي (نفس منطق computeBalance)
  const refunded = refunds.filter(r => !r.deleted).reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalPaid = Math.max(0, grossPaid - refunded);

  return {
    owed: Math.round(totalOwed * 100) / 100,
    paid: Math.round(totalPaid * 100) / 100,
    remaining: Math.round((totalOwed - totalPaid) * 100) / 100,
  };
}

function byStudent<T extends { studentId: string; deleted?: boolean }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) if (!row.deleted) {
    const list = map.get(row.studentId) || [];
    list.push(row);
    map.set(row.studentId, list);
  }
  return map;
}

/** One pre-indexed snapshot, rather than a new database read set for each student. */
export function debtorRows(data: LedgerSnapshot, asOf: string): DebtorRow[] {
  const today = dayjs(asOf).format('YYYY-MM-DD');
  const payments = byStudent(data.payments), refunds = byStudent(data.refunds), installments = byStudent(data.installments);
  const rows: DebtorRow[] = [];
  for (const student of data.students) {
    if (student.deleted || student.status === 'ended') continue;
    const studentPayments = payments.get(student.id) || [];
    const balance = studentBalance(student, { payments: studentPayments, refunds: refunds.get(student.id) || [], installments: installments.get(student.id) || [], enrollments: [] }, data.groups, data.courses, today);
    if (balance.remaining <= 0) continue;
    const lastPaymentDate = studentPayments.filter(isCountedPayment).map(row => row.date).sort().pop();
    rows.push({
      studentId: student.id, name: student.name, parentPhone: student.parentPhone, phone: student.phone, status: student.status,
      owed: balance.owed, paid: balance.paid, remaining: balance.remaining, unpaidCount: balance.unpaidCount,
      overdueCount: balance.overdueCount, overdueAmount: balance.overdueAmount,
      groups: balance.groups.filter(group => group.remaining > 0).map(group => ({ groupId: group.groupId, groupName: group.groupName, courseName: group.courseName, remaining: group.remaining })),
      lastPaymentDate, daysSinceLastPayment: lastPaymentDate ? dayjs(asOf).diff(dayjs(lastPaymentDate), 'day') : null,
    });
  }
  return rows.sort((a, b) => b.remaining - a.remaining);
}
