import dayjs from 'dayjs';
import { requireRule } from '../../domain/errors';
import type { Payment } from '../../domain/models';
import { requireChoice, requireDate, requireLive, requireMoney } from '../../domain/validation';
import { generateId } from '../../lib/ids';
import { withBillingTransaction } from '../billing/unitOfWork';
import { recordPaymentInUnit } from '../paymentService';
import { commandAudit, requirePermission, type Actor } from './access';

export type PaymentDraft = Pick<Payment, 'studentId' | 'amount' | 'type' | 'status' | 'date' | 'method' | 'notes'> & {
  courseId?: string;
  collectedBy?: string;
};

export async function createPayment(actor: Actor, draft: PaymentDraft, receiptPrefix?: string): Promise<{ payment: Payment; warning?: string }> {
  requirePermission(actor, 'payments', 'create');
  requireMoney(draft.amount, true);
  requireDate(draft.date);
  requireChoice(draft.type, ['subscription', 'books', 'other'], 'نوع الدفعة غير صحيح');
  requireChoice(draft.status, ['paid', 'pending', 'late'], 'حالة الدفعة غير صحيحة');
  requireChoice(
    draft.method || 'cash',
    ['cash', 'wallet', 'instapay', 'card', 'bank', 'other'],
    'طريقة الدفع غير صحيحة',
  );
  const payment = await withBillingTransaction(async unit => {
    if (draft.status === 'paid' && draft.type === 'subscription') {
      const result = await recordPaymentInUnit(unit, {
        studentId: draft.studentId,
        amount: draft.amount,
        date: draft.date,
        courseId: draft.courseId || undefined,
        notes: draft.notes || undefined,
        method: draft.method,
        collectedBy: actor.id,
        collectedByName: draft.collectedBy || actor.username,
      });
      requireRule(result.success && result.payment, result.error || 'تعذّر تسجيل الدفعة');
      return result.payment;
    }

    requireLive(await unit.get('students', draft.studentId), 'الطالب غير موجود');
    const receiptNo =
      draft.status === 'paid'
        ? await unit.receipt(draft.date, receiptPrefix)
        : undefined;
    const now = new Date().toISOString();
    const row: Payment = {
      id: generateId(),
      studentId: draft.studentId,
      courseId: draft.courseId || undefined,
      amount: draft.amount,
      type: draft.type,
      status: draft.status,
      date: draft.date,
      method: draft.method || 'cash',
      notes: draft.notes,
      collectedBy: actor.id,
      collectedByName: draft.collectedBy || actor.username,
      receiptNo,
      createdAt: now,
      updatedAt: now,
    };
    await unit.add('payments', row);
    await unit.recalculate(row.studentId);
    return row;
  });
  commandAudit(actor, {
    action: 'payment',
    entity: 'payment',
    entityId: payment.id,
    details: `تسجيل دفعة ${payment.amount} للطالب ${payment.studentId} — ${payment.receiptNo || payment.status}`,
  });
  return { payment, warning: undefined };
}

/** Fresh read + receipt + status in one transaction makes repeated clicks idempotent. */
export async function markPendingPaymentPaid(actor: Actor, id: string, receiptPrefix?: string): Promise<{ payment: Payment; changed: boolean; warning?: string }> {
  requirePermission(actor, 'payments', 'edit');
  const result = await withBillingTransaction(async unit => {
    const current = requireLive(await unit.get('payments', id), 'الدفعة غير موجودة');
    requireRule(!current.voided, 'الدفعة ملغاة');
    if (current.status === 'paid') { await unit.rebuild(current.studentId); return { payment: current, changed: false }; }
    requireMoney(current.amount, true);
    const date = dayjs().format('YYYY-MM-DD');
    const receiptNo =
      current.receiptNo || (await unit.receipt(date, receiptPrefix));
    const payment: Payment = {
      ...current,
      status: 'paid',
      date,
      receiptNo,
      collectedBy: current.collectedBy || actor.id,
      collectedByName: current.collectedByName || actor.username,
      updatedAt: new Date().toISOString(),
    };
    await unit.put('payments', payment);
    await unit.rebuild(payment.studentId);
    return { payment, changed: true };
  });
  if (result.changed)
    commandAudit(actor, {
      action: 'payment',
      entity: 'payment',
      entityId: id,
      details: `تحصيل دفعة معلقة بقيمة ${result.payment.amount} — إيصال ${result.payment.receiptNo}`,
    });
  return { ...result, warning: undefined };
}

export async function deletePendingPayment(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, 'payments', 'delete');
  const deleted = await withBillingTransaction(async unit => {
    const current = requireLive(await unit.get('payments', id), 'الدفعة غير موجودة');
    requireRule(current.status !== 'paid' && !current.voided, 'استخدم إلغاء الدفعة المسددة بدلاً من حذفها');
    const now = new Date().toISOString();
    const tombstone = { ...current, deleted: true, deletedAt: now, deletedBy: actor.id, updatedAt: now };
    await unit.put('payments', tombstone);
    await unit.recalculate(current.studentId);
    return current;
  });
  commandAudit(actor, {
    action: 'delete',
    entity: 'payment',
    entityId: id,
    details: `حذف دفعة معلقة بقيمة ${deleted.amount}`,
  });
}
