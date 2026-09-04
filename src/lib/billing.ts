/**
 * Billing — منطق المستحقات والأقساط
 *
 * كل الدوال هنا "نقية" (Pure): مدخلات → مخرجات، بدون أي وصول لـ IndexedDB،
 * عشان تبقى قابلة للاختبار المباشر في vitest (src/test/billing.test.ts).
 * الربط بقاعدة البيانات موجود في src/lib/db.ts.
 */
import dayjs from 'dayjs';

/** عدد الحصص في الشهر — الافتراضي لو مفيش تحديد من الكورس/المجموعة/الإعدادات */
export const SESSIONS_PER_MONTH = 8;

/** أسابيع في الشهر (لتحويل «أيام في الأسبوع» → «حصص في الشهر») */
export const WEEKS_PER_MONTH = 4;

/**
 * عدد الحصص الفعلي في الشهر، بالترتيب ده:
 *  1) تحديد صريح على الكورس (`course.sessionsPerMonth`)
 *  2) محسوب من جدول المجموعة: عدد الأيام في الأسبوع × 4
 *  3) الإعداد العام (`settings.sessionsPerMonth`)
 *  4) الافتراضي 8
 *
 * ده بيحل مشكلة إن كل الكورسات كانت بتتحاسب على 8 حصص حتى لو المجموعة
 * بتقابل مرة واحدة في الأسبوع (4 حصص) — فالقسط والتناسب كانوا بيظلموا الطالب.
 */
export function resolveSessionsPerMonth(opts: {
  courseSessionsPerMonth?: number | null;
  scheduleDays?: string[][] | null;
  settingSessionsPerMonth?: number | null;
}): number {
  const { courseSessionsPerMonth, scheduleDays, settingSessionsPerMonth } = opts;

  if (courseSessionsPerMonth && courseSessionsPerMonth > 0) {
    return Math.round(courseSessionsPerMonth);
  }

  // عدد الأيام المختلفة في الأسبوع من جدول المجموعة
  const days = new Set<string>();
  (scheduleDays || []).forEach(list => (list || []).forEach(d => {
    const key = String(d || '').trim().toLowerCase();
    if (key) days.add(key);
  }));
  if (days.size > 0) {
    return Math.max(1, days.size * WEEKS_PER_MONTH);
  }

  if (settingSessionsPerMonth && settingSessionsPerMonth > 0) {
    return Math.round(settingSessionsPerMonth);
  }

  return SESSIONS_PER_MONTH;
}

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
export interface PricingInput {
  /** سعر الكورس الشهري */
  coursePrice: number;
  /** سعر خاص بالتسجيل (يتجاوز سعر الكورس) */
  priceOverride?: number | null;
  /** خصم ثابت (جنيه) على كل قسط */
  discountAmount?: number | null;
  /** خصم نسبة مئوية (0-100) على كل قسط — بيتحسب بعد priceOverride */
  discountPercent?: number | null;
}

/**
 * السعر الشهري الفعلي بعد السعر الخاص والخصومات.
 * الترتيب: priceOverride (لو موجود) → خصم النسبة → خصم المبلغ → لا يقل عن صفر.
 */
export function effectiveMonthlyPrice(p: PricingInput): number {
  const hasOverride = p.priceOverride !== undefined && p.priceOverride !== null && p.priceOverride >= 0;
  const base = hasOverride ? Number(p.priceOverride) : (p.coursePrice || 0);

  let price = Math.max(0, base);
  const pct = Math.min(100, Math.max(0, p.discountPercent || 0));
  if (pct > 0) price = price * (1 - pct / 100);
  price -= Math.max(0, p.discountAmount || 0);

  return round2(Math.max(0, price));
}

/** تفصيل الخصم (للعرض في الواجهة والإيصال) */
export function discountBreakdown(p: PricingInput): {
  base: number;
  final: number;
  saved: number;
  byOverride: number;
  byPercent: number;
  byAmount: number;
} {
  const courseBase = Math.max(0, p.coursePrice || 0);
  const afterOverride = p.priceOverride !== undefined && p.priceOverride !== null && p.priceOverride >= 0
    ? Math.max(0, Number(p.priceOverride))
    : courseBase;
  const pct = Math.min(100, Math.max(0, p.discountPercent || 0));
  const afterPercent = afterOverride * (1 - pct / 100);
  const amountCut = Math.min(afterPercent, Math.max(0, p.discountAmount || 0));
  const final = round2(Math.max(0, afterPercent - amountCut));

  return {
    base: round2(courseBase),
    final,
    saved: round2(Math.max(0, courseBase - final)),
    byOverride: round2(Math.max(0, courseBase - afterOverride)),
    byPercent: round2(Math.max(0, afterOverride - afterPercent)),
    byAmount: round2(amountCut),
  };
}

/**
 * تاريخ استحقاق قسط.
 * - لو فيه `dueDayOfMonth`: كل الأقساط تستحق في اليوم ده من شهرها (يوم موحد للتحصيل).
 *   القسط الأول لو اليوم الموحد عدى وقت التسجيل بيترحّل للشهر اللي بعده.
 * - لو مفيش: الاستحقاق = تاريخ التسجيل + شهر (السلوك القديم).
 * - `graceDays` أيام سماح بتتزاد على التاريخ (القسط بيتحوّل «متأخر» بعدها).
 */
export function computeDueDate(opts: {
  startDate: string;
  periodOffset: number;
  dueDayOfMonth?: number | null;
  graceDays?: number | null;
}): string {
  const start = dayjs(opts.startDate);
  const offset = Math.max(0, opts.periodOffset || 0);
  const grace = Math.max(0, opts.graceDays || 0);

  let base = start.add(offset, 'month');

  const day = opts.dueDayOfMonth;
  if (day && day >= 1 && day <= 28) {
    base = base.startOf('month').date(day);
    // القسط الأول: لو اليوم الموحد فات وقت التسجيل → الشهر اللي بعده
    if (offset === 0 && base.isBefore(start, 'day')) base = base.add(1, 'month');
  }

  return base.add(grace, 'day').format('YYYY-MM-DD');
}

export interface MonthlyPlanOptions extends PricingInput {
  durationMonths: number;
  startDate: string;
  /** تجاوز اختياري لقيمة القسط الأول (للالتحاق في نص الكورس) */
  firstPeriodAmount?: number;
  dueDayOfMonth?: number | null;
  graceDays?: number | null;
}

/**
 * بناء خطة تقسيط شهرية.
 * سعر الكورس شهري، إذن عدد الأقساط = مدة الكورس بالشهور، وقيمة كل قسط = السعر الفعلي
 * (بعد السعر الخاص والخصومات).
 */
export function buildMonthlyPlan(opts: MonthlyPlanOptions): InstallmentDraft[] {
  const { durationMonths, startDate, firstPeriodAmount } = opts;
  const periods = Math.max(1, Math.floor(durationMonths || 1));
  const price = effectiveMonthlyPrice(opts);

  const plan: InstallmentDraft[] = [];
  for (let i = 0; i < periods; i++) {
    const amount = i === 0 && firstPeriodAmount !== undefined
      ? Math.max(0, round2(firstPeriodAmount))
      : price;
    plan.push({
      periodIndex: i + 1,
      periodLabel: `الشهر ${i + 1} من ${periods}`,
      amount,
      dueDate: computeDueDate({
        startDate,
        periodOffset: i,
        dueDayOfMonth: opts.dueDayOfMonth,
        graceDays: opts.graceDays,
      }),
    });
  }
  return plan;
}

/** سعر الحصة الواحدة من السعر الشهري (حسب عدد الحصص الفعلي في الشهر) */
export function sessionPrice(coursePrice: number, sessionsPerMonth: number = SESSIONS_PER_MONTH): number {
  const sessions = Math.max(1, sessionsPerMonth || SESSIONS_PER_MONTH);
  return Math.max(0, coursePrice || 0) / sessions;
}

/**
 * قيمة الشهر الأول لطالب التحق في نص الكورس.
 * @param joinedAtSession رقم الحصة اللي دخل منها (1 = أول حصة في الشهر)
 * @param sessionsPerMonth عدد الحصص الحقيقي في الشهر (من الكورس/الجدول/الإعدادات)
 */
export function proratedFirstPeriod(
  coursePrice: number,
  joinedAtSession: number,
  sessionsPerMonth: number = SESSIONS_PER_MONTH,
): number {
  const sessions = Math.max(1, sessionsPerMonth || SESSIONS_PER_MONTH);
  const from = Math.min(Math.max(1, joinedAtSession || 1), sessions);
  const remainingSessions = sessions - (from - 1);
  return round2(sessionPrice(coursePrice, sessions) * remainingSessions);
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
 * توزيع دفعة على الأقساط: الأقدم استحقاقاً الأول، وبعدها الأقدم تسجيلاً، ثم رقم القسط.
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
      // 1) الأقدم استحقاقاً  2) الأقدم تسجيلاً  3) رقم القسط
      const byDate = dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf();
      if (byDate !== 0) return byDate;
      const byCreated = (a.createdAt || '').localeCompare(b.createdAt || '');
      if (byCreated !== 0) return byCreated;
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
/**
 * هل الدفعة دي بتتحسب في أي مجموع مالي؟
 * قاعدة واحدة لكل النظام: المحذوفة والملغاة (void) مش بتتحسب، والباقي لازم يكون `paid`.
 */
export function isCountedPayment(p: {
  status?: string;
  deleted?: boolean;
  voided?: boolean;
}): boolean {
  return !p.deleted && !p.voided && p.status === 'paid';
}

export interface ComputeBalanceInput {
  installments: Installment[];
  payments: { amount: number; status: string; type: string; deleted?: boolean; voided?: boolean }[];
  /** الاستردادات بتقلل المدفوع */
  refunds?: { amount: number; deleted?: boolean }[];
}

export function computeBalance(opts: ComputeBalanceInput): BalanceSummary {
  const { installments, payments } = opts;

  const subscriptionOwed = installments
    .filter(i => !i.deleted && i.status !== 'cancelled')
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  // البنود غير الاشتراكية (كتب/أخرى) بتتحسب مستحقات لو مش ملغاة/محذوفة
  const extraOwed = payments
    .filter(p => !p.deleted && !p.voided && p.type !== 'subscription')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const grossPaid = payments
    .filter(isCountedPayment)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const refunded = (opts.refunds || [])
    .filter(r => !r.deleted)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const paid = round2(Math.max(0, grossPaid - refunded));
  const owed = round2(subscriptionOwed + extraOwed);
  return { owed, paid, remaining: round2(owed - paid) };
}

/**
 * رصيد دائن لصالح الطالب (لو دفع أكتر من المستحق).
 * `remaining` سالب = فلوس للطالب عند المركز.
 */
export function creditOf(summary: Pick<BalanceSummary, 'remaining'>): number {
  return round2(Math.max(0, -(summary.remaining || 0)));
}

// ==================== AGING (أعمار الديون) ====================

export interface AgingBucket {
  key: string;
  label: string;
  /** أقل عدد أيام تأخير (شامل) */
  min: number;
  /** أقصى عدد أيام تأخير (غير شامل) — null = بلا حد */
  max: number | null;
  count: number;
  amount: number;
}

export const AGING_RANGES: { key: string; label: string; min: number; max: number | null }[] = [
  { key: 'current', label: 'لسه ما استحقش', min: -Infinity, max: 1 },
  { key: 'd30', label: '1 - 30 يوم', min: 1, max: 31 },
  { key: 'd60', label: '31 - 60 يوم', min: 31, max: 61 },
  { key: 'd90', label: '61 - 90 يوم', min: 61, max: 91 },
  { key: 'd90p', label: 'أكتر من 90 يوم', min: 91, max: null },
];

/** عدد أيام التأخير لقسط (سالب/صفر = لسه ما استحقش) */
export function daysOverdue(
  i: Pick<Installment, 'dueDate'>,
  today: string = dayjs().format('YYYY-MM-DD'),
): number {
  if (!i.dueDate) return 0;
  return dayjs(today).startOf('day').diff(dayjs(i.dueDate).startOf('day'), 'day');
}

/**
 * توزيع الديون على شرائح عمرية — أهم تقرير للتحصيل:
 * يقول لك الفلوس الضايعة بقالها قد إيه ومين اللي محتاج إجراء فوري.
 */
export function debtAging(
  installments: Installment[],
  today: string = dayjs().format('YYYY-MM-DD'),
): AgingBucket[] {
  const buckets: AgingBucket[] = AGING_RANGES.map(r => ({ ...r, count: 0, amount: 0 }));

  for (const i of installments) {
    if (i.deleted || i.status === 'cancelled') continue;
    const remaining = installmentRemaining(i);
    if (remaining <= 0) continue;

    const days = daysOverdue(i, today);
    const bucket = buckets.find(b => days >= b.min && (b.max === null || days < b.max));
    if (bucket) {
      bucket.count += 1;
      bucket.amount = round2(bucket.amount + remaining);
    }
  }

  return buckets;
}

// ==================== UPCOMING DUES (استحقاق قريب) ====================

export interface UpcomingDues {
  count: number;
  amount: number;
  items: (Installment & { daysUntilDue: number })[];
}

/**
 * الأقساط اللي استحقاقها خلال `daysAhead` يوم ولسه مش مسددة.
 * التنبيه **قبل** الاستحقاق بيرفع التحصيل بدل ما نستنى لما تتأخر.
 */
export function upcomingDues(
  installments: Installment[],
  daysAhead: number = 3,
  today: string = dayjs().format('YYYY-MM-DD'),
): UpcomingDues {
  const horizon = dayjs(today).startOf('day').add(Math.max(0, daysAhead), 'day');
  const items: (Installment & { daysUntilDue: number })[] = [];

  for (const i of installments) {
    if (i.deleted || i.status === 'cancelled') continue;
    const remaining = installmentRemaining(i);
    if (remaining <= 0) continue;
    const due = dayjs(i.dueDate).startOf('day');
    if (due.isBefore(dayjs(today).startOf('day'))) continue; // متأخر بالفعل — مكانه في المديونيات
    if (due.isAfter(horizon)) continue;
    items.push({ ...i, daysUntilDue: due.diff(dayjs(today).startOf('day'), 'day') });
  }

  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    count: items.length,
    amount: round2(items.reduce((s, i) => s + installmentRemaining(i), 0)),
    items,
  };
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
