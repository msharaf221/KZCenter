import dayjs from 'dayjs';
import { readAll } from '../data/readers';
import { requireRule } from '../domain/errors';
import { validateCollection } from '../domain/ledger/validation';
import type { Payment, PaymentMethod, PaymentType, Refund } from '../domain/models';
import { requireChoice } from '../domain/validation';
import { isCountedPayment } from '../lib/billing';
import { generateId } from '../lib/ids';
import { billingOperation } from './billing/operation';
import { withBillingTransaction, type BillingUnit } from './billing/unitOfWork';

export interface PaymentResult {
  success: boolean;
  error?: string;
  payment?: Payment;
  /** المبلغ اللي اتوزّع فعلاً على الأقساط */
  applied?: number;
  remainingAfter?: number;
  /** رصيد دائن لصالح الطالب بعد الدفعة (لو دفع أكتر من المستحق) */
  creditAfter?: number;
}

/**
 * تسجيل دفعة (كاملة أو جزئية) على أقساط طالب.
 * - groupId اختياري: لو اتحدد، الدفعة تتوزع على أقساط هذه المجموعة فقط.
 * - التوزيع: الأقدم استحقاقاً الأول.
 * - أي مبلغ زيادة عن المستحق يُسجَّل كدفعة (فائض) بدون أقساط مرتبطة.
 */
export interface RecordPaymentOptions {
  studentId: string;
  amount: number;
  groupId?: string;
  date?: string;
  notes?: string;
  courseId?: string;
  type?: PaymentType;
  // ==================== v7: محاسبة ومسؤولية ====================
  method?: PaymentMethod;
  collectedBy?: string;
  collectedByName?: string;
  /** رقم إيصال محدد (لو فاضي بيتحجز رقم تسلسلي تلقائياً) */
  receiptNo?: string;
}

export async function recordInstallmentPayment(opts: RecordPaymentOptions): Promise<PaymentResult> {
  return billingOperation(unit => recordPaymentInUnit(unit, opts));
}

export async function recordPaymentInUnit(unit: BillingUnit, opts: RecordPaymentOptions): Promise<PaymentResult> {
  const { studentId, amount } = opts;
  if (!studentId) return { success: false, error: 'اختر طالباً' };
  if (!(amount > 0)) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

  const student = await unit.get('students', studentId);
  if (!student) return { success: false, error: 'الطالب غير موجود' };

  const date = opts.date ?? dayjs().format('YYYY-MM-DD');
  validateCollection(amount, date, opts.method);
  requireChoice(opts.type || 'subscription', ['subscription', 'books', 'other'], 'نوع الدفعة غير صحيح');
  const now = new Date().toISOString();
  const group = opts.groupId ? await unit.get('groups', opts.groupId) : undefined;
  requireRule(!opts.groupId || group, 'المجموعة غير موجودة');

  const policy = await unit.policy();
  const receiptNo = (opts.receiptNo || '').trim() || (await unit.receipt(date, policy.receiptPrefix));

  const payment: Payment = {
    id: generateId(),
    studentId,
    courseId: opts.courseId || group?.courseId,
    groupId: opts.groupId,
    amount,
    type: opts.type || 'subscription',
    status: 'paid',
    date,
    installmentIds: [],
    method: opts.method || 'cash',
    collectedBy: opts.collectedBy,
    collectedByName: opts.collectedByName,
    receiptNo,
    notes: opts.notes || (group ? `سداد — ${group.name}` : 'سداد أقساط'),
    createdAt: now,
    updatedAt: now,
  };
  await unit.add('payments', payment);

  // إعادة بناء المدفوع على الأقساط من كل الدفعات المسددة (طريق واحد صحيح)
  await unit.rebuild(studentId);
  const after = await unit.balance(studentId);

  return {
    success: true,
    payment,
    applied: amount,
    remainingAfter: Math.max(0, after?.remaining ?? 0),
    creditAfter: after?.credit ?? 0,
  };

}

/**
 * إلغاء دفعة (void) — مش حذف.
 * الدفعة بتفضل في السجل برقم إيصالها وسبب الإلغاء ومين ألغاها، لكنها ما بتتحسبش
 * في أي مجموع وما بتغطّيش أي قسط (rebuild بيستثنيها).
 */
export async function voidPayment(opts: {
  paymentId: string;
  reason: string;
  userId?: string;
  username?: string;
}): Promise<{ success: boolean; error?: string }> {
  return billingOperation(async unit => {
    const payment = await unit.get('payments', opts.paymentId);
    if (!payment) return { success: false, error: 'الدفعة غير موجودة' };
    if (payment.voided) return { success: false, error: 'الدفعة ملغاة بالفعل' };

    const reason = (opts.reason || '').trim();
    if (!reason) return { success: false, error: 'سبب الإلغاء مطلوب' };

    await unit.put('payments', {
      ...payment,
      voided: true,
      voidedAt: new Date().toISOString(),
      voidReason: reason,
      voidedBy: opts.username || opts.userId || 'غير معروف',
      installmentIds: [],
      updatedAt: new Date().toISOString(),
    });

    // إعادة توزيع الأقساط من الدفعات الصالحة فقط
    await unit.rebuild(payment.studentId);
    return { success: true };

  });
}

/** تسجيل استرداد مبلغ لطالب (بيقلل المدفوع وبيظهر في الخزينة كمصروف نقدي) */
export async function recordRefund(opts: {
  studentId: string;
  amount: number;
  reason: string;
  paymentId?: string;
  groupId?: string;
  method?: PaymentMethod;
  date?: string;
  userId?: string;
  username?: string;
}): Promise<{ success: boolean; error?: string; refund?: Refund }> {
  return billingOperation(async unit => {
    validateCollection(opts.amount, opts.date ?? dayjs().format('YYYY-MM-DD'), opts.method);
    if (opts.paymentId) {
      const payment = await unit.get('payments', opts.paymentId);
      requireRule(payment && payment.studentId === opts.studentId && isCountedPayment(payment), 'الدفعة غير صالحة للاسترداد لهذا الطالب');
    }
    if (!(opts.amount > 0)) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

    const reason = (opts.reason || '').trim();
    if (!reason) return { success: false, error: 'سبب الاسترداد مطلوب' };

    const student = await unit.get('students', opts.studentId);
    if (!student) return { success: false, error: 'الطالب غير موجود' };

    // ما نرجّعش أكتر من اللي الطالب دفعه فعلاً
    const balance = await unit.balance(opts.studentId);
    const paid = balance?.paid ?? 0;
    if (opts.amount > paid) {
      return { success: false, error: `الاسترداد (${opts.amount}) أكبر من إجمالي المدفوع (${paid})` };
    }

    const now = new Date().toISOString();
    const refund: Refund = {
      id: generateId(),
      studentId: opts.studentId,
      paymentId: opts.paymentId,
      groupId: opts.groupId,
      amount: opts.amount,
      reason,
      method: opts.method || 'cash',
      date: opts.date ?? dayjs().format('YYYY-MM-DD'),
      userId: opts.userId,
      username: opts.username,
      createdAt: now,
      updatedAt: now,
    };
    await unit.add('refunds', refund);
    await unit.recalculate(opts.studentId);

    return { success: true, refund };

  });
}

/** كل الاستردادات (الأحدث الأول) — بتُخصم من الإيراد وتظهر في الخزينة */
export async function getRefunds(): Promise<Refund[]> {
  const rows = await readAll<Refund>('refunds');
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * إعادة بناء "المدفوع" على أقساط طالب من الصفر، بناءً على كل الدفعات المسددة
 * غير المحذوفة (الأقدم تاريخاً الأول).
 *
 * دي الطريقة الآمنة الوحيدة للتحديث: أي إضافة/حذف/تغيير حالة دفعة بتستدعيها،
 * فالأقساط تفضل مطابقة للدفعات الفعلية من غير تراكم أخطاء.
 */
export async function rebuildInstallmentsFromPayments(studentId: string): Promise<void> {
  return withBillingTransaction(unit => unit.rebuild(studentId));
}

/**
 * دفع المتبقي: يحسب المتبقي على الطالب (أو على مجموعة محددة) ويسدده دفعة واحدة.
 */
export async function payStudentRemaining(studentId: string, groupId?: string, date?: string): Promise<PaymentResult> {
  return billingOperation(async unit => {
    const balance = await unit.balance(studentId);
    if (!balance) return { success: false, error: 'الطالب غير موجود' };

    const target = groupId ? balance.groups.find(g => g.groupId === groupId) : undefined;
    if (groupId && !target) return { success: false, error: 'لا توجد مستحقات على هذه المجموعة' };

    const remaining = target ? target.remaining : balance.groups.reduce((sum, g) => sum + g.remaining, 0);

    if (remaining <= 0) return { success: false, error: 'لا يوجد مبلغ متبقٍ على الطالب' };

    return recordPaymentInUnit(unit, {
      studentId,
      groupId,
      amount: remaining,
      date,
      notes: target ? `سداد المتبقي — ${target.groupName}` : 'سداد كامل المتبقي',
    });

  });
}
