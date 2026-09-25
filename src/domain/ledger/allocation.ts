import { applyPayment, installmentState, isCountedPayment, type Installment } from '../../lib/billing';
import type { Payment } from '../models';

/** Replay subscriptions oldest-first. Refunds affect net balance, not this historic allocation policy. */
export function allocateLedger(installments: Installment[], payments: Payment[], today: string) {

  // تصفير المدفوع (الملغي يفضل ملغي — applyPayment بيتخطاه)
  let current: Installment[] = installments.map(i => ({ ...i, paidAmount: 0 }));

  // الدفعات المحسوبة بس (مش محذوفة/ملغاة) — الملغاة ما بتغطّيش أي قسط
  const paidSubscription = payments
    .filter(p => isCountedPayment(p) && p.type === 'subscription')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const idsByPayment = new Map<string, string[]>();

  for (const p of paidSubscription) {
    const scope = p.groupId ? current.filter(i => i.groupId === p.groupId) : current;
    const applied = applyPayment(scope, p.amount, today);
    const updated = new Map(applied.installments.map(i => [i.id, i]));
    current = current.map(i => updated.get(i.id) || i);
    idsByPayment.set(p.id, applied.touchedIds);
  }

  return {
    installments: current.map(row => ({ ...row, status: installmentState(row, today) })),
    payments: paidSubscription.map(payment => ({ ...payment, installmentIds: idsByPayment.get(payment.id) || [] })),
  };
}
