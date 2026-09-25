import { readAll, readByIndex } from '../data/readers';
import { carriedEnrollmentPricing } from '../domain/ledger/pricing';
import { validateEnrollmentInput } from '../domain/ledger/validation';
import type { Enrollment, Group } from '../domain/models';
import {
  buildMonthlyPlan,
  effectiveMonthlyPrice,
  InstallmentStatus,
  isCountedPayment,
  PricingInput,
  proratedFirstPeriod,
  resolveSessionsPerMonth
} from '../lib/billing';
import { generateId } from '../lib/ids';
import { billingOperation } from './billing/operation';

// ==================== TRANSFER (تحويل بين المجموعات/المدرسين) ====================

export interface TransferResult {
  success: boolean;
  error?: string;
  /** اللي كان مدفوع في المجموعة القديمة = الرصيد المرحّل */
  credit?: number;
  /** المتبقي على الطالب قبل التحويل */
  remainingBefore?: number;
  /** المتبقي على الطالب بعد التحويل */
  remainingAfter?: number;
}

/**
 * تحويل طالب من مجموعة لمجموعة (أو من مدرس لمدرس) في عملية واحدة ذرّية.
 *
 * - التعليم القديم بيتحوّل لـ `transferred` مع التاريخ والسبب والمجموعة الهدف
 * - كل أقساط المجموعة القديمة بتتلغي، فالفلوس المدفوعة تترحل كرصيد للمجموعة
 *   الجديدة تلقائياً (عن طريق إعادة بناء المدفوع)، وأي فرق في السعر يظهر كمتبقي
 * - بتتولّد خطة أقساط جديدة في المجموعة الهدف (مع دعم الالتحاق من حصة معينة)
 */
export async function transferStudent(opts: {
  studentId: string;
  fromGroupId: string;
  toGroupId: string;
  startSession?: number;
  reason?: string;
}): Promise<TransferResult> {
  return billingOperation(async unit => {
    validateEnrollmentInput(undefined, opts);
    const { studentId, fromGroupId, toGroupId } = opts;

    if (fromGroupId === toGroupId) {
      return { success: false, error: 'المجموعة الجديدة هي نفسها المجموعة الحالية' };
    }

    const [student, fromGroup, toGroup] = await Promise.all([
      unit.get('students', studentId),
      unit.get('groups', fromGroupId),
      unit.get('groups', toGroupId),
    ]);
    if (!student) return { success: false, error: 'الطالب غير موجود' };
    if (!fromGroup) return { success: false, error: 'المجموعة الحالية غير موجودة' };
    if (!toGroup) return { success: false, error: 'المجموعة الجديدة غير موجودة' };
    if (toGroup.status === 'ended') return { success: false, error: 'المجموعة الجديدة منتهية' };
    if (toGroup.studentIds.length >= toGroup.maxStudents) {
      return { success: false, error: `المجموعة الجديدة مكتملة (${toGroup.studentIds.length}/${toGroup.maxStudents})` };
    }

    const fromEnrollments = await unit.index('enrollments', 'by-studentGroup', [studentId, fromGroupId]);
    const activeFrom = fromEnrollments.find(e => e.status === 'active' && !e.deleted);
    if (!activeFrom) return { success: false, error: 'الطالب غير مسجل في المجموعة الحالية' };

    const toEnrollments = await unit.index('enrollments', 'by-studentGroup', [studentId, toGroupId]);
    if (toEnrollments.some(e => e.status === 'active' && !e.deleted)) {
      return { success: false, error: 'الطالب مسجل بالفعل في المجموعة الجديدة' };
    }

    const before = await unit.balance(studentId);
    const remainingBefore = before?.remaining ?? 0;
    const now = new Date().toISOString();

    // 1) الرصيد المرحّل = اللي مدفوع فعلاً في أقساط المجموعة القديمة
    const oldInstallments = await unit.index('installments', 'by-studentGroup', [studentId, fromGroupId]);
    const credit = oldInstallments.filter(i => i.status !== 'cancelled').reduce((sum, i) => sum + (i.paidAmount || 0), 0);

    // 2) إلغاء كل أقساط المجموعة القديمة (فالمدفوع يترحل كرصيد للمجموعة الجديدة)
    for (const inst of oldInstallments) {
      if (inst.status === 'cancelled') continue;
      await unit.put('installments', {
        ...inst,
        status: 'cancelled' as InstallmentStatus,
        notes: `ملغي: تحويل إلى ${toGroup.name}`,
        updatedAt: now,
      });
    }

    // 3) التعليم القديم → transferred (سجل التحويل)
    await unit.put('enrollments', {
      ...activeFrom,
      status: 'transferred',
      droppedAt: now,
      dropReason: opts.reason || `تحويل إلى ${toGroup.name}`,
      transferredToGroupId: toGroupId,
      updatedAt: now,
    });

    // 4) تسجيل جديد + خطة أقساط في المجموعة الجديدة
    const startSession = opts.startSession && opts.startSession > 1 ? opts.startSession : undefined;

    // الخصومات الخاصة بالطالب تتنقل معاه للمجموعة الجديدة؛ السعر الخاص (priceOverride) ينتقل
    // فقط لو نفس الكورس (لأنه رقم مطلق مربوط بسعر كورس معيّن)
    const sameCourse = fromGroup.courseId === toGroup.courseId;
    const carriedPricing = carriedEnrollmentPricing(activeFrom, sameCourse);

    const newEnrollment: Enrollment = {
      id: generateId(),
      studentId,
      groupId: toGroupId,
      status: 'active',
      enrolledAt: now,
      startSession,
      initialPayment: 0,
      ...carriedPricing,
      notes: `محوّل من ${fromGroup.name}`,
      createdAt: now,
      updatedAt: now,
    };
    await unit.add('enrollments', newEnrollment);

    const course = await unit.get('courses', toGroup.courseId);
    const transferPolicy = await unit.policy();
    const toSessionsPerMonth = resolveSessionsPerMonth({
      courseSessionsPerMonth: course?.sessionsPerMonth,
      settingSessionsPerMonth: transferPolicy.sessionsPerMonth,
    });
    const transferPricing: PricingInput = { coursePrice: course?.price || 0, ...carriedPricing };
    const transferMonthlyPrice = effectiveMonthlyPrice(transferPricing);
    // شهر واحد في المجموعة الجديدة (نفس قاعدة التسجيل: نفس يوم الاستحقاق وفترة السماح من الإعدادات)
    // — ولو دخل من نص الشهر يتحاسب على الحصص الباقية
    const plan = buildMonthlyPlan({
      ...transferPricing,
      durationMonths: 1,
      startDate: now,
      dueDayOfMonth: transferPolicy.dueDayOfMonth,
      graceDays: transferPolicy.graceDays,
      firstPeriodAmount: startSession
        ? proratedFirstPeriod(transferMonthlyPrice, startSession, toSessionsPerMonth)
        : undefined,
    });
    await unit.bulk(
      'installments',
      plan.map(p => ({
        id: generateId(),
        studentId,
        groupId: toGroupId,
        enrollmentId: newEnrollment.id,
        periodIndex: p.periodIndex,
        periodLabel: p.periodLabel,
        amount: p.amount,
        paidAmount: 0,
        dueDate: p.dueDate,
        status: 'pending' as InstallmentStatus,
        notes: `محوّل من ${fromGroup.name}`,
        createdAt: now,
        updatedAt: now,
      })),
    );

    // 5) تحديث القوائم وحالة المجموعتين
    await unit.put('groups', {
      ...fromGroup,
      studentIds: fromGroup.studentIds.filter(sid => sid !== studentId),
      updatedAt: now,
    });
    await unit.put('groups', {
      ...toGroup,
      studentIds: [...new Set([...toGroup.studentIds, studentId])],
      updatedAt: now,
    });
    await unit.put('students', {
      ...student,
      enrolledGroups: [...new Set([...(student.enrolledGroups || []).filter(gid => gid !== fromGroupId), toGroupId])],
      updatedAt: now,
    });
    await unit.syncGroup(fromGroupId);
    await unit.syncGroup(toGroupId);

    // 6) ترحيل الدفعة غير المُستهلكة من المجموعة القديمة إلى الجديدة.
    //    أقساط القديمة ملغاة؛ أي مبلغ دُفع ولم يُستهلك (الرصيد المرحّل credit)
    //    يجب أن يغطّي شهر المجموعة الجديدة، وإلا الطالب يظهر مديناً رغم دفعه.
    //    ننقل الدفعة الاشتراكية الأقدم فالأحدث حتى نُغطّي مبلغ الترحيل،
    //    ونربطها بالمجموعة الجديدة مع مذكرة تتبّع للمراجعة.
    const allPayments = await unit.index('payments', 'by-studentId', studentId);
    const oldSubPayments = allPayments
      .filter(p => isCountedPayment(p) && p.type === 'subscription' && p.groupId === fromGroupId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    let toRelocate = Math.round(credit * 100) / 100;
    for (const p of oldSubPayments) {
      if (toRelocate <= 0) break;
      await unit.put('payments', {
        ...p,
        groupId: toGroupId,
        courseId: toGroup.courseId,
        notes: p.notes
          ? `${p.notes} — مُرحّلة من ${fromGroup.name} إلى ${toGroup.name}`
          : `مرحّلة من ${fromGroup.name} إلى ${toGroup.name}`,
        installmentIds: [],
        updatedAt: now,
      });
      toRelocate = Math.round((toRelocate - (p.amount || 0)) * 100) / 100;
    }

    // 7) إعادة توزيع المدفوع على الأقساط الجديدة + تحديث أرصدة الطالب
    await unit.rebuild(studentId);

    const after = await unit.balance(studentId);
    return { success: true, credit, remainingBefore, remainingAfter: after?.remaining ?? 0 };

  });
}

export interface TransferRecord {
  id: string;
  fromGroupId: string;
  fromGroupName: string;
  toGroupId?: string;
  toGroupName: string;
  date: string;
  reason?: string;
}

/** سجل تحويلات الطالب (من تعليمات الحالة transferred) */
export async function getTransferHistory(studentId: string): Promise<TransferRecord[]> {
  const enrollments = await readByIndex<Enrollment>('enrollments', 'by-studentId', studentId);
  const transfers = enrollments.filter(e => !e.deleted && e.status === 'transferred');
  if (transfers.length === 0) return [];

  const groups = await readAll<Group>('groups');
  const nameOf = (gid?: string) => (gid ? groups.find(g => g.id === gid)?.name || 'مجموعة محذوفة' : '—');

  return transfers
    .slice()
    .sort((a, b) => (b.droppedAt || '').localeCompare(a.droppedAt || ''))
    .map(e => ({
      id: e.id,
      fromGroupId: e.groupId,
      fromGroupName: nameOf(e.groupId),
      toGroupId: e.transferredToGroupId,
      toGroupName: nameOf(e.transferredToGroupId),
      date: e.droppedAt || e.updatedAt,
      reason: e.dropReason,
    }));
}
