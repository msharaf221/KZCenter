import dayjs from 'dayjs';
import { readSnapshot } from '../data/readers';
import { userErrorMessage } from '../domain/errors';
import { renewalCandidates, type RenewalCandidate } from '../domain/ledger/renewals';
import { validateEnrollmentInput } from '../domain/ledger/validation';
import type {
  Enrollment,
  EnrollmentRenewal,
  Payment,
  PaymentMethod
} from '../domain/models';
import { requireDate, requireNumber } from '../domain/validation';
import {
  buildMonthlyPlan,
  effectiveMonthlyPrice,
  Installment,
  InstallmentStatus,
  PricingInput,
  renewalInfo
} from '../lib/billing';
import { generateId } from '../lib/ids';
import { withBillingTransaction } from './billing/unitOfWork';

// ==================== RENEWAL (تجديد / استكمال الاشتراك) ====================

export interface RenewOptions {
  studentId: string;
  groupId: string;
  /** عدد الشهور الجديدة (افتراضي: شهر واحد) */
  months?: number;
  /** بداية الأقساط الجديدة YYYY-MM-DD (افتراضي: بعد آخر قسط، أو النهاردة لو الاشتراك منتهي) */
  startDate?: string;
  /** دفعة عند التجديد (اختياري) */
  initialPayment?: number;
  paymentMethod?: PaymentMethod;
  collectedBy?: string;
  collectedByName?: string;
  /** تسعير مختلف عن التسجيل الأصلي (لو فاضي بيستخدم نفس السعر/الخصم المتفق عليه) */
  priceOverride?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
  notes?: string;
  userId?: string;
  username?: string;
}

export interface RenewResult {
  success: boolean;
  error?: string;
  /** عدد الأقساط اللي اتضافت */
  installmentsCreated?: number;
  /** رقم الدورة (1 = أول تجديد) */
  cycle?: number;
  monthlyPrice?: number;
  /** أول وآخر استحقاق في الخطة الجديدة */
  firstDueDate?: string;
  lastDueDate?: string;
  remainingAfter?: number;
}

/**
 * تجديد/استكمال اشتراك طالب في مجموعة **من غير ما يخرج ويدخل تاني**.
 *
 * الفرق عن `enrollStudent`: التسجيل نفسه بيفضل موجود (بتاريخه وخصوماته وسجل حضوره)،
 * وبنضيف بس دورة جديدة من الأقساط تكمّل الترقيم بعد الخطة القديمة.
 * - لو عليه متبقي من الدورة القديمة بيفضل زي ما هو (ما بيتلغيش ولا بيتنقل).
 * - لو الطالب كان `ended` أو `suspended` بيرجع `active` تلقائياً.
 * - لو التسجيل كان `completed`/`dropped` (خرج قبل كده) بيتعاد تفعيله.
 */
export async function renewEnrollment(opts: RenewOptions): Promise<RenewResult> {
  try {
    return await withBillingTransaction(async unit => {
      validateEnrollmentInput(opts.initialPayment, opts);
      if (opts.startDate !== undefined) requireDate(opts.startDate);
      if (opts.months !== undefined) requireNumber(opts.months, 'عدد الشهور غير صحيح', 1, true);
      const { studentId, groupId } = opts;
      const [student, group] = await Promise.all([
        unit.get('students', studentId),
        unit.get('groups', groupId),
      ]);
      if (!student) return { success: false, error: 'الطالب غير موجود' };
      if (!group) return { success: false, error: 'المجموعة غير موجودة' };
      if (group.status === 'ended')
        return { success: false, error: 'المجموعة منتهية — حوّل الطالب لمجموعة تانية بدل التجديد' };

      const course = await unit.get('courses', group.courseId);
      const months = Math.max(1, Math.floor(opts.months || 1));

      // التسجيل: النشط، وإلا آخر تسجيل (مكتمل/خارج) نعيد تفعيله
      const enrollments = (await unit.index('enrollments', 'by-studentGroup', [studentId, groupId]))
        .filter(e => !e.deleted)
        .sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));
      let enrollment = enrollments.find(e => e.status === 'active');
      let reactivated = false;
      if (!enrollment) {
        const previous = enrollments.find(e => e.status === 'completed' || e.status === 'dropped');
        if (!previous) return { success: false, error: 'الطالب غير مسجل في هذه المجموعة — سجّله الأول' };
        // إعادة تفعيل تسجيل قديم بتحتاج مكان في المجموعة
        if (!group.studentIds.includes(studentId) && group.studentIds.length >= group.maxStudents) {
          return { success: false, error: `المجموعة مكتملة (${group.studentIds.length}/${group.maxStudents})` };
        }
        enrollment = previous;
        reactivated = true;
      }

      const now = new Date().toISOString();
      const today = dayjs().format('YYYY-MM-DD');
      const policy = await unit.policy();

      // الأقساط الحالية → نحدد آخر رقم وآخر استحقاق
      const existing = (await unit.index('installments', 'by-studentGroup', [studentId, groupId])).filter(
        i => !i.deleted,
      );
      const info = renewalInfo(existing, today, 0);
      const startDate =
        opts.startDate && dayjs(opts.startDate).isValid()
          ? dayjs(opts.startDate).format('YYYY-MM-DD')
          : info.nextStartDate;

      // التسعير: لو المستخدم حدد سعر/خصم جديد نستخدمه، وإلا نكمّل بنفس اتفاق التسجيل الأصلي
      const pricing: PricingInput = {
        coursePrice: course?.price || 0,
        priceOverride: opts.priceOverride ?? enrollment.priceOverride,
        discountAmount: opts.discountAmount ?? enrollment.discountAmount,
        discountPercent: opts.discountPercent ?? enrollment.discountPercent,
      };
      const monthlyPrice = effectiveMonthlyPrice(pricing);
      const cycle = (enrollment.renewalCount || 0) + 1;

      const plan = buildMonthlyPlan({
        ...pricing,
        durationMonths: months,
        startDate,
        dueDayOfMonth: policy.dueDayOfMonth,
        graceDays: policy.graceDays,
        startPeriodIndex: info.lastPeriodIndex + 1,
        labelPrefix: `تجديد ${cycle}`,
      });
      const created: Installment[] = plan.map(p => ({
        id: generateId(),
        studentId,
        groupId,
        enrollmentId: enrollment!.id,
        periodIndex: p.periodIndex,
        periodLabel: p.periodLabel,
        amount: p.amount,
        paidAmount: 0,
        dueDate: p.dueDate,
        status: 'pending' as InstallmentStatus,
        notes: opts.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      }));
      await unit.bulk('installments', created);

      // تحديث التسجيل (سجل التجديد + إعادة التفعيل لو لزم)
      const renewal: EnrollmentRenewal = {
        cycle,
        at: now,
        startDate,
        months,
        monthlyPrice,
        initialPayment: opts.initialPayment || 0,
        byUserId: opts.userId,
        byUsername: opts.username,
        notes: opts.notes?.trim() || undefined,
      };
      await unit.put('enrollments', {
        ...enrollment,
        status: 'active',
        droppedAt: reactivated ? undefined : enrollment.droppedAt,
        dropReason: reactivated ? undefined : enrollment.dropReason,
        renewalCount: cycle,
        renewedAt: now,
        renewals: [...(enrollment.renewals || []), renewal],
        priceOverride: pricing.priceOverride ?? undefined,
        discountAmount: pricing.discountAmount ?? undefined,
        discountPercent: pricing.discountPercent ?? undefined,
        discountReason: opts.discountReason ?? enrollment.discountReason,
        updatedAt: now,
      } satisfies Enrollment);

      // المصفوفات المكررة + حالة الطالب
      if (!group.studentIds.includes(studentId)) {
        await unit.put('groups', { ...group, studentIds: [...group.studentIds, studentId], updatedAt: now });
        await unit.syncGroup(groupId);
      }
      const enrolledGroups = [...new Set([...(student.enrolledGroups || []), groupId])];
      if (student.status !== 'active' || enrolledGroups.length !== (student.enrolledGroups || []).length) {
        await unit.put('students', { ...student, status: 'active', enrolledGroups, updatedAt: now });
      }

      // دفعة التجديد (لو فيه)
      if (opts.initialPayment && opts.initialPayment > 0) {
        const receiptNo = await unit.receipt(today, policy.receiptPrefix);
        await unit.add('payments', {
          id: generateId(),
          studentId,
          courseId: group.courseId,
          groupId,
          amount: opts.initialPayment,
          date: today,
          type: 'subscription',
          status: 'paid',
          installmentIds: [],
          method: opts.paymentMethod || 'cash',
          collectedBy: opts.collectedBy,
          collectedByName: opts.collectedByName,
          receiptNo,
          notes: `تجديد اشتراك — ${group.name}`,
          createdAt: now,
          updatedAt: now,
        } satisfies Payment);
      }

      await unit.rebuild(studentId);
      const after = await unit.balance(studentId);

      return {
        success: true,
        installmentsCreated: created.length,
        cycle,
        monthlyPrice,
        firstDueDate: created[0]?.dueDate,
        lastDueDate: created[created.length - 1]?.dueDate,
        remainingAfter: Math.max(0, after?.remaining ?? 0),
      };

    });
  } catch (error) {
    console.error('renewEnrollment error:', error);
    return { success: false, error: userErrorMessage(error, 'تعذّر إتمام العملية. لم يتم حفظ تغييرات جزئية.') };
  }
}

export type { RenewalCandidate } from '../domain/ledger/renewals';

export async function getRenewalCandidates(daysAhead = 7): Promise<RenewalCandidate[]> {
  return renewalCandidates(await readSnapshot(['enrollments', 'students', 'groups', 'courses', 'teachers', 'installments']), dayjs().format('YYYY-MM-DD'), daysAhead);
}
