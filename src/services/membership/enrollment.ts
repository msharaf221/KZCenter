import dayjs from 'dayjs';
import { requireRule } from '../../domain/errors';
import { validateEnrollmentInput } from '../../domain/ledger/validation';
import type { EnrollOptions } from '../../domain/membership/types';
import type { Enrollment, Payment } from '../../domain/models';
import { buildMonthlyPlan, effectiveMonthlyPrice, installmentRemaining, proratedFirstPeriod, resolveSessionsPerMonth, type Installment, type InstallmentStatus, type PricingInput } from '../../lib/billing';
import { generateId } from '../../lib/ids';
import type { BillingUnit } from '../billing/unitOfWork';

/** Composable work: callers own the transaction. Expected failures throw so the entire caller rolls back. */
export async function enrollInUnit(unit: BillingUnit, studentId: string, groupId: string, initialPayment?: number, opts?: EnrollOptions) {
  validateEnrollmentInput(initialPayment, opts);
  // 1. Validate
  const [student, group] = await Promise.all([
    unit.get('students', studentId),
    unit.get('groups', groupId),
  ]);

  requireRule(student, 'الطالب غير موجود');
  requireRule(group, 'المجموعة غير موجودة');
  requireRule(group.status !== 'ended', 'المجموعة منتهية');
  requireRule(group.status !== 'full', 'المجموعة مكتملة');

  // 2. Check if already enrolled
  const existingEnrollments = await unit.index('enrollments', 'by-studentGroup', [studentId, groupId]);
  const activeEnrollment = existingEnrollments.find(e => e.status === 'active' && !e.deleted);
  requireRule(!activeEnrollment, 'الطالب مسجل بالفعل في هذه المجموعة');

  // 3. Check capacity
  requireRule(group.studentIds.length < group.maxStudents, 'المجموعة مكتملة');

  // 4. Create enrollment record (Single Source of Truth)
  const enrollmentId = generateId();
  const now = new Date().toISOString();
  const startSession = opts?.startSession && opts.startSession > 1 ? opts.startSession : undefined;

  const course = await unit.get('courses', group.courseId);
  const policy = await unit.policy();

  // التسعير الفعلي: سعر خاص → خصم نسبة → خصم مبلغ
  const pricing: PricingInput = {
    coursePrice: course?.price || 0,
    priceOverride: opts?.priceOverride,
    discountAmount: opts?.discountAmount,
    discountPercent: opts?.discountPercent,
  };
  const monthlyPrice = effectiveMonthlyPrice(pricing);

  const enrollment: Enrollment = {
    id: enrollmentId,
    studentId,
    groupId,
    status: 'active',
    enrolledAt: now,
    startSession,
    initialPayment: initialPayment || 0,
    priceOverride: opts?.priceOverride,
    discountAmount: opts?.discountAmount,
    discountPercent: opts?.discountPercent,
    discountReason: opts?.discountReason,
    isTrial: opts?.isTrial,
    createdAt: now,
    updatedAt: now,
  };
  await unit.add('enrollments', enrollment);

  // 4b. توليد خطة الأقساط الشهرية لهذا التسجيل (المستحقات الحقيقية على الطالب)
  // عدد الحصص الفعلي في الشهر بيحدد تناسب الالتحاق في نص الكورس
  const sessionsPerMonth = resolveSessionsPerMonth({
    courseSessionsPerMonth: course?.sessionsPerMonth,
    settingSessionsPerMonth: policy.sessionsPerMonth,
  });

  // النظام شهر بشهر: التسجيل بيفتح شهر واحد بس، والشهر اللي بعده بالتجديد
  const plan = buildMonthlyPlan({
    ...pricing,
    durationMonths: 1,
    startDate: now,
    dueDayOfMonth: policy.dueDayOfMonth,
    graceDays: policy.graceDays,
    // الالتحاق في نص الكورس: الشهر الأول يتحسب على الحصص الباقية بس
    firstPeriodAmount: startSession ? proratedFirstPeriod(monthlyPrice, startSession, sessionsPerMonth) : undefined,
  });
  const createdInstallments: Installment[] = plan.map(p => ({
    id: generateId(),
    studentId,
    groupId,
    enrollmentId,
    periodIndex: p.periodIndex,
    periodLabel: p.periodLabel,
    amount: p.amount,
    paidAmount: 0,
    dueDate: p.dueDate,
    status: 'pending' as InstallmentStatus,
    createdAt: now,
    updatedAt: now,
  }));

  // 5. Update denormalized arrays (for performance)
  await unit.put('groups', {
    ...group,
    studentIds: [...new Set([...group.studentIds, studentId])],
    updatedAt: now,
  });

  await unit.put('students', {
    ...student,
    enrolledGroups: [...new Set([...student.enrolledGroups, groupId])],
    updatedAt: now,
  });

  // 6. حفظ خطة الأقساط، ثم تسجيل الدفعة الأولى (لو فيه)
  await unit.bulk('installments', createdInstallments);

  if (initialPayment && initialPayment > 0) {
    const paymentDate = dayjs().format('YYYY-MM-DD'); // تاريخ محلي (مش UTC) زي باقي الدفعات
    const receiptNo = await unit.receipt(paymentDate, policy.receiptPrefix);
    await unit.add('payments', {
      id: generateId(),
      studentId,
      courseId: group.courseId,
      groupId,
      amount: initialPayment,
      date: paymentDate,
      type: 'subscription',
      status: 'paid',
      installmentIds: [],
      method: opts?.paymentMethod || 'cash',
      collectedBy: opts?.collectedBy,
      collectedByName: opts?.collectedByName,
      receiptNo,
      notes: `تسجيل في ${group.name}`,
      createdAt: now,
      updatedAt: now,
    } satisfies Payment);
  }

  // 7. Sync group status
  await unit.syncGroup(groupId);

  // 8. توزيع الدفعات على الأقساط + إعادة حساب أرصدة الطالب
  await unit.rebuild(studentId);

  return { success: true as const, enrollmentId, monthlyPrice };

}

/**
 * Keep paid history; cancel only unpaid installments, as the withdrawal policy always did.
 * Composite removals may also clean legacy links without an active enrollment.
 */
export async function detachInUnit(unit: BillingUnit, studentId: string, groupId: string, reason = 'إزالة يدوية', options: { allowLegacy?: boolean; recalculate?: boolean } = {}): Promise<void> {
  const enrollments = await unit.index('enrollments', 'by-studentGroup', [studentId, groupId]);
  const active = enrollments.filter(row => row.status === 'active');
  requireRule(options.allowLegacy || active.length > 0, 'الطالب غير مسجل في هذه المجموعة');
  const now = new Date().toISOString();
  for (const row of active) await unit.put('enrollments', { ...row, status: 'dropped', droppedAt: now, dropReason: reason, updatedAt: now });
  const installments = await unit.index('installments', 'by-studentGroup', [studentId, groupId]);
  for (const row of installments) if (row.status !== 'cancelled' && installmentRemaining(row) > 0) {
    await unit.put('installments', { ...row, status: 'cancelled', notes: row.notes ? `${row.notes} — ${reason}` : `ملغي: ${reason}`, updatedAt: now });
  }
  const student = await unit.get('students', studentId);
  if (student) await unit.put('students', { ...student, enrolledGroups: (student.enrolledGroups || []).filter(id => id !== groupId), updatedAt: now });
  const group = await unit.get('groups', groupId);
  if (group) {
    await unit.put('groups', { ...group, studentIds: group.studentIds.filter(id => id !== studentId), updatedAt: now });
    await unit.syncGroup(groupId);
  }
  if (options.recalculate !== false) await unit.recalculate(studentId);
}
