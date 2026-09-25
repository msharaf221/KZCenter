import dayjs from 'dayjs';
import { installmentRemaining, type Installment } from '../../lib/billing';
import { round2 } from '../../lib/money';
import type { Student } from '../models';

export type WriteOffScope = 'all' | 'due';

export const WRITE_OFF_SCOPE_LABEL: Record<WriteOffScope, string> = {
  all: 'كل المتبقي',
  due: 'المستحق والمتأخر فقط',
};

export const WRITE_OFF_SCOPE_HINT: Record<WriteOffScope, string> = {
  all: 'كل قسط عليه متبقي، حتى اللي استحقاقه لسه جاي',
  due: 'الأقساط اللي استحقت أو اتأخرت بس — المستقبل يتفضل زي ما هو',
};

/** كلمة التأكيد اللي لازم المستخدم يكتبها في النافذة قبل تنفيذ التصفير */
export const WRITE_OFF_CONFIRM_WORD = 'تصفير';

/** الأقساط اللي هيخلّيها التصفير (للعرض في نافذة التأكيد وللتنفيذ) */
export interface WriteOffPreview {
  scope: WriteOffScope;
  /** عدد الأقساط اللي هتتلغي */
  installmentsCount: number;
  /** عدد الطلاب المتأثرين */
  studentsCount: number;
  /** إجمالي المتبقي اللي هيتصفّر */
  amount: number;
  /** الجزء المتأخر من المبلغ (فات تاريخ استحقاقه) */
  overdueAmount: number;
}

export interface WriteOffResult {
  success: boolean;
  error?: string;
  /** ملخص اللي اتصفّر فعلاً */
  preview?: WriteOffPreview;
  /** إجمالي المتبقي على كل الطلاب قبل التصفير */
  remainingBefore?: number;
  /** إجمالي المتبقي على كل الطلاب بعد التصفير */
  remainingAfter?: number;
}

export interface WriteOffOptions {
  /** اليوم المرجعي لحساب «المستحق» في نطاق `due` (افتراضي: اليوم) */
  today?: string;
  /** Optional review fence for interactive destructive commands; legacy callers may omit it. */
  expectedFingerprint?: string;
}

export function collectWriteOffTargets(scope: WriteOffScope, today: string, installments: Installment[], students: Student[]): Installment[] {
  const studentById = new Map(students.map(s => [s.id, s]));

  return installments.filter(inst => {
    if (inst.deleted || inst.status === 'cancelled') return false;
    // القسط المسدد بالكامل مفيش عليه متبقي يتصفّر
    if (installmentRemaining(inst) <= 0) return false;

    const student = studentById.get(inst.studentId);
    if (!student || student.deleted || student.status === 'ended') return false;

    if (scope === 'due') {
      if (!inst.dueDate) return false;
      // ملاحظة: `isSameOrBefore` بتحتاج بلوجن، فبنستخدم نفي `isAfter` (نفس النتيجة)
      return !dayjs(inst.dueDate).isAfter(dayjs(today), 'day');
    }
    return true;
  });
}

export function buildPreview(scope: WriteOffScope, targets: Installment[], today: string): WriteOffPreview {
  let amount = 0;
  let overdueAmount = 0;
  const students = new Set<string>();

  for (const inst of targets) {
    const remaining = installmentRemaining(inst);
    amount += remaining;
    if (inst.dueDate && dayjs(inst.dueDate).isBefore(dayjs(today), 'day')) {
      overdueAmount += remaining;
    }
    students.add(inst.studentId);
  }

  return {
    scope,
    installmentsCount: targets.length,
    studentsCount: students.size,
    amount: round2(amount),
    overdueAmount: round2(overdueAmount),
  };
}


export function writeOffFingerprint(scope: WriteOffScope, today: string, targets: Installment[]): string {
  return JSON.stringify([scope, today, targets.slice().sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.studentId, row.amount, row.paidAmount, row.status, row.dueDate, row.updatedAt])]);
}
