import { requireRule } from '../../domain/errors';
import { WRITE_OFF_CONFIRM_WORD, type WriteOffScope } from '../../domain/ledger/writeOff';
import { writeOffDebts } from '../debtWriteOffService';
import { enrollStudent, unenrollStudent, type EnrollOptions } from '../enrollmentService';
import { recordInstallmentPayment, recordRefund, voidPayment, type RecordPaymentOptions } from '../paymentService';
import { renewEnrollment, type RenewOptions } from '../renewalService';
import { transferStudent } from '../transferService';
import { commandAudit, requirePermission, type Actor } from './access';

export async function collectStudentPayment(actor: Actor, options: RecordPaymentOptions) {
  requirePermission(actor, 'payments', 'create');
  const result = await recordInstallmentPayment({ ...options, collectedBy: actor.id, collectedByName: actor.username });
  requireRule(result.success, result.error || 'تعذّر تسجيل الدفعة');
  commandAudit(actor, { action: 'payment', entity: 'payment', entityId: result.payment?.id, details: `تحصيل ${options.amount} للطالب ${options.studentId} — ${result.payment?.receiptNo || ''}` });
  return result;
}
export async function cancelStudentPayment(actor: Actor, options: Parameters<typeof voidPayment>[0]) {
  requirePermission(actor, 'refunds', 'create');
  const result = await voidPayment({ ...options, userId: actor.id, username: actor.username });
  requireRule(result.success, result.error || 'تعذّر إلغاء الدفعة');
  commandAudit(actor, { action: 'update', entity: 'payment', entityId: options.paymentId, details: `إلغاء دفعة — ${options.reason.trim()}` });
  return result;
}
export async function refundStudentPayment(actor: Actor, options: Parameters<typeof recordRefund>[0]) {
  requirePermission(actor, 'refunds', 'create');
  const result = await recordRefund({ ...options, userId: actor.id, username: actor.username });
  requireRule(result.success, result.error || 'تعذّر الاسترداد');
  commandAudit(actor, { action: 'create', entity: 'refund', entityId: result.refund?.id, details: `استرداد ${options.amount} للطالب ${options.studentId} — ${options.reason.trim()}` });
  return result;
}
export async function enrollGroupStudent(actor: Actor, studentId: string, groupId: string, initialPayment?: number, options?: EnrollOptions) {
  requirePermission(actor, 'groups', 'edit');
  if ((initialPayment || 0) > 0) requirePermission(actor, 'payments', 'create');
  const result = await enrollStudent(studentId, groupId, initialPayment, { ...options, collectedBy: actor.id, collectedByName: actor.username });
  requireRule(result.success, result.error || 'تعذّر التسجيل');
  commandAudit(actor, { action: 'update', entity: 'group', entityId: groupId, details: `تسجيل الطالب ${studentId}${initialPayment ? ` — دفعة ${initialPayment}` : ''}` });
  return result;
}
export async function removeGroupStudent(actor: Actor, studentId: string, groupId: string, reason?: string) {
  requirePermission(actor, 'groups', 'edit');
  const result = await unenrollStudent(studentId, groupId, reason);
  requireRule(result.success, result.error || 'تعذّر إلغاء التسجيل');
  commandAudit(actor, { action: 'update', entity: 'group', entityId: groupId, details: `إزالة الطالب ${studentId} — ${reason || 'إزالة يدوية'}` });
  return result;
}
export async function renewStudentSubscription(actor: Actor, options: RenewOptions) {
  requirePermission(actor, 'payments', 'create');
  const result = await renewEnrollment({ ...options, collectedBy: actor.id, collectedByName: actor.username, userId: actor.id, username: actor.username });
  requireRule(result.success, result.error || 'تعذّر التجديد');
  commandAudit(actor, { action: 'update', entity: 'enrollment', entityId: `${options.studentId}:${options.groupId}`, details: `تجديد ${options.months || 1} شهر للطالب ${options.studentId} — الدورة ${result.cycle}` });
  return result;
}
export async function transferGroupStudent(actor: Actor, options: Parameters<typeof transferStudent>[0]) {
  requirePermission(actor, 'students', 'edit');
  const result = await transferStudent(options);
  requireRule(result.success, result.error || 'تعذّر التحويل');
  commandAudit(actor, { action: 'update', entity: 'enrollment', entityId: `${options.studentId}:${options.fromGroupId}`, details: `تحويل إلى ${options.toGroupId} — ${options.reason || ''}` });
  return result;
}
export async function confirmDebtWriteOff(actor: Actor, scope: WriteOffScope, reason: string, confirmation: string, review: { fingerprint: string; today: string }) {
  requirePermission(actor, 'debtors', 'delete');
  requireRule(confirmation.replace(/[\s\u0640]/g, '') === WRITE_OFF_CONFIRM_WORD, 'اكتب كلمة تصفير لتأكيد العملية');
  requireRule(!!review.fingerprint, 'أعد تحميل معاينة المديونيات');
  const result = await writeOffDebts(scope, reason, { today: review.today, expectedFingerprint: review.fingerprint });
  requireRule(result.success, result.error || 'تعذّر التصفير');
  commandAudit(actor, { action: 'writeoff', entity: 'installments', details: `تصفير مديونيات (${scope}): ${result.preview?.amount} — ${result.preview?.installmentsCount} قسط — ${result.preview?.studentsCount} طالب — المتبقي ${result.remainingBefore} → ${result.remainingAfter} — السبب: ${reason.trim()}` });
  return result;
}
