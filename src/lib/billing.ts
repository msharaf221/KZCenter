/**
 * Billing — منطق المستحقات والأقساط
 *
 * كل الدوال هنا "نقية" (Pure): مدخلات → مخرجات، بدون أي وصول لـ IndexedDB،
 * عشان تبقى قابلة للاختبار المباشر في vitest (src/test/billing.test.ts).
 * الربط بقاعدة البيانات موجود في src/lib/db.ts.
 */
import dayjs from 'dayjs';

/** عدد الحصص في الشهر — ثابت لكل الكورسات (قرار المنتج) */
export const SESSIONS_PER_MONTH = 8;

export type InstallmentStatus = 'paid' | 'partial' | 'pending' | 'late' | 'cancelled';

/**
 * قسط مستحق على طالب في مجموعة.
 * القسط هو وحدة الدين الحقيقية: المبلغ + تاريخ الاستحقاق + المدفوع منه.
 */
export interface Installment {
  id: string;
  studentId: string;
  groupId: string;
  enrollmentId?: string;
  /** رقم القسط داخل خطة التقسيط (1 = أول شهر) */
  periodIndex: number;
  periodLabel: string;
  /** المبلغ المستحق */
  amount: number;
  /** المدفوع من هذا القسط */
  paidAmount: number;
  /** تاريخ الاستحقاق YYYY-MM-DD */
  dueDate: string;
  status: InstallmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface InstallmentDraft {
  periodIndex: number;
  periodLabel: string;
  amount: number;
  dueDate: string;
}

export interface BalanceSummary {
  /** إجمالي المستحق */
  owed: number;
  /** إجمالي المدفوع */
  paid: number;
  /** المتبقي (owed - paid) */
  remaining: number;
}

// ==================== PLAN BUILDING ====================

/**
 * بناء خطة تقسيط شهرية.
 * سعر الكورس شهري، إذن عدد الأقساط = مدة الكورس بالشهور، وقيمة كل قسط = سعر الشهر.
 *
 * @param firstPeriodAmount تجاوز اختياري لقيمة القسط الأول
 *        (يُستخدم لاحقاً لمن يلتحق في نص الشهر/الكورس فيُحاسب على الحصص الباقية فقط)
 */
export function buildMonthlyPlan(opts: {
  coursePrice: number;
  durationMonths: number;
  startDate: string;
  firstPeriodAmount?: number;
}): InstallmentDraft[] {
  const { coursePrice, durationMonths, startDate, firstPeriodAmount } = opts;
  const periods = Math.max(1, Math.floor(durationMonths || 1));
  const price = Math.max(0, coursePrice || 0);
  const start = dayjs(startDate);

  const plan: InstallmentDraft[] = [];
  for (let i = 0; i < periods; i++) {
    const amount = i === 0 && firstPeriodAmount !== undefined
      ? Math.max(0, Math.round(firstPeriodAmount * 100) / 100)
      : price;
    plan.push({
      periodIndex: i + 1,
      periodLabel: `الشهر ${i + 1} من ${periods}`,
      amount,
      dueDate: start.add(i, 'month').format('YYYY-MM-DD'),
    });
  }
  return plan;
}

/** سعر الحصة الواحدة من السعر الشهري للكورس */
export function sessionPrice(coursePrice: number): number {
  return Math.max(0, coursePrice || 0) / SESSIONS_PER_MONTH;
}

/**
 * قيمة الشهر الأول لطالب التحق في نص الكورس.
 * @param joinedAtSession رقم الحصة اللي دخل منها (1 = أول حصة في الشهر)
 */
export function proratedFirstPeriod(coursePrice: number, joinedAtSession: number): number {
  const from = Math.min(Math.max(1, joinedAtSession || 1), SESSIONS_PER_MONTH);
  const remainingSessions = SESSIONS_PER_MONTH - (from - 1);
  return Math.round(sessionPrice(coursePrice) * remainingSessions * 100) / 100;
}

// ==================== STATUS ====================

/** المتبقي على قسط واحد */
export function installmentRemaining(i: Pick<Installment, 'amount' | 'paidAmount'>): number {
  return Math.max(0, Math.round(((i.amount || 0) - (i.paidAmount || 0)) * 100) / 100);
}

/**
 * حالة القسط المحسوبة من الأرقام والتاريخ (مش من الحالة المخزّنة)،
 * عشان القسط يتحوّل لـ "متأخر" تلقائياً أول ما يعدّي تاريخ استحقاقه.
 */
export function installmentState(
  i: Pick<Installment, 'amount' | 'paidAmount' | 'dueDate' | 'status'>,
  today: string = dayjs().format('YYYY-MM-DD')
): InstallmentStatus {
  if (i.status === 'cancelled') return 'cancelled';
  const remaining = installmentRemaining(i);
  if (remaining <= 0) return 'paid';
  if (i.dueDate && dayjs(i.dueDate).isBefore(dayjs(today), 'day')) return 'late';
  if ((i.paidAmount || 0) > 0) return 'partial';
  return 'pending';
}

/** هل القسط متأخر (فات تاريخ استحقاقه وفيه باقي)؟ */
export function isOverdue(
  i: Pick<Installment, 'amount' | 'paidAmount' | 'dueDate' | 'status'>,
  today: string = dayjs().format('YYYY-MM-DD')
): boolean {
  return installmentState(i, today) === 'late';
}

// ==================== PAYMENT APPLICATION ====================

export interface ApplyPaymentResult {
  installments: Installment[];
  /** المبلغ اللي اتوزّع فعلاً على الأقساط */
  applied: number;
  /** مبلغ فائض ما لقاش أقساط تستوعبه (يُرجع للمناداة لتسجيله كفائض) */
  leftover: number;
  /** أرقام الأقساط اللي اتأثرت */
  touchedIds: string[];
}

/**
 * توزيع دفعة على الأقساط: الأقدم استحقاقاً الأول، ثم بالأقل دفْعاً.
 * لا تعدّل المصفوفة الأصلية (ترجع نسخة جديدة).
 */
export function applyPayment(
  installments: Installment[],
  amount: number,
  today: string = dayjs().format('YYYY-MM-DD')
): ApplyPaymentResult {
  const updated = installments.map(i => ({ ...i }));
  let left = Math.max(0, amount || 0);
  const touchedIds: string[] = [];

  const order = updated
    .filter(i => i.status !== 'cancelled' && installmentRemaining(i) > 0)
    .sort((a, b) => {
      const byDate = dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf();
      if (byDate !== 0) return byDate;
      return a.periodIndex - b.periodIndex;
    });

  for (const inst of order) {
    if (left <= 0) break;
    const remaining = installmentRemaining(inst);
    const pay = Math.min(remaining, left);
    inst.paidAmount = Math.round(((inst.paidAmount || 0) + pay) * 100) / 100;
    inst.status = installmentState(inst, today);
    inst.updatedAt = new Date().toISOString();
    left = Math.round((left - pay) * 100) / 100;
    touchedIds.push(inst.id);
  }

  return {
    installments: updated,
    applied: Math.round(((amount || 0) - left) * 100) / 100,
    leftover: left,
    touchedIds,
  };
}

/**
 * توزيع مبلغ مدفوع مسبقاً (بيانات قديمة) على خطة أقساط.
 * يُستخدم في ترحيل البيانات: عندنا إجمالي المدفوع بس من غير ربط بأقساط.
 */
export function distributePaid(
  installments: Installment[],
  paidAmount: number,
  today: string = dayjs().format('YYYY-MM-DD')
): Installment[] {
  return applyPayment(installments, paidAmount, today).installments;
}

// ==================== SUMMARIES ====================

export interface InstallmentSummary {
  total: number;
  paid: number;
  remaining: number;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
}

/** ملخص أقساط (مجموعة أقساط لطالب أو لمجموعة أو للكل) */
export function summarize(
  installments: Installment[],
  today: string = dayjs().format('YYYY-MM-DD')
): InstallmentSummary {
  const active = installments.filter(i => !i.deleted && i.status !== 'cancelled');
  let total = 0;
  let paid = 0;
  let unpaidCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const i of active) {
    total += i.amount || 0;
    paid += i.paidAmount || 0;
    const remaining = installmentRemaining(i);
    if (remaining > 0) unpaidCount++;
    if (isOverdue(i, today)) {
      overdueCount++;
      overdueAmount += remaining;
    }
  }

  return {
    total: round2(total),
    paid: round2(paid),
    remaining: round2(Math.max(0, total - paid)),
    unpaidCount,
    overdueCount,
    overdueAmount: round2(overdueAmount),
  };
}

/**
 * رصيد الطالب:
 * - المستحق = أقساط الاشتراك (غير الملغاة) + بنود غير الاشتراك (كتب/أخرى)
 * - المدفوع = كل الدفعات المحصّلة
 * (نفس دلالة recalculateStudentTotalPaid القديمة، لكن المستحق بقى مبني على أقساط حقيقية)
 */
export function computeBalance(opts: {
  installments: Installment[];
  payments: { amount: number; status: string; type: string; deleted?: boolean }[];
}): BalanceSummary {
  const { installments, payments } = opts;

  const subscriptionOwed = installments
    .filter(i => !i.deleted && i.status !== 'cancelled')
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const extraOwed = payments
    .filter(p => !p.deleted && p.type !== 'subscription')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const paid = payments
    .filter(p => !p.deleted && p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const owed = round2(subscriptionOwed + extraOwed);
  return { owed, paid: round2(paid), remaining: round2(owed - paid) };
}

function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  paid: 'مسدد',
  partial: 'مدفوع جزئياً',
  pending: 'مستحق',
  late: 'متأخر',
  cancelled: 'ملغي',
};
