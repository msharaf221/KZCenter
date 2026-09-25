import type { BalanceSummary, Installment } from '../../lib/billing';
import type { Course, Enrollment, Group, Payment, Refund, Student, StudentStatus } from '../models';

export interface GroupBalance {
  groupId: string;
  groupName: string;
  courseName: string;
  owed: number;
  paid: number;
  remaining: number;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  installments: Installment[];
}

export interface StudentBalance extends BalanceSummary {
  studentId: string;
  studentName: string;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  /** رصيد دائن لصالح الطالب (دفع أكتر من المستحق) — بيظهر في ملفه وفي التحصيل */
  credit: number;
  /** إجمالي الاستردادات */
  refunded: number;
  groups: GroupBalance[];
}

export interface DebtorRow {
  studentId: string;
  name: string;
  parentPhone: string;
  phone?: string;
  status: StudentStatus;
  owed: number;
  paid: number;
  remaining: number;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  groups: { groupId: string; groupName: string; courseName: string; remaining: number }[];
  lastPaymentDate?: string;
  /** عدد الأيام من آخر دفعة (null لو ما دفعش خالص) */
  daysSinceLastPayment: number | null;
}


export interface StudentLedger { installments: Installment[]; payments: Payment[]; refunds: Refund[]; enrollments: Enrollment[] }
export interface LedgerSnapshot { students: Student[]; payments: Payment[]; refunds: Refund[]; installments: Installment[]; groups: Group[]; courses: Course[] }
