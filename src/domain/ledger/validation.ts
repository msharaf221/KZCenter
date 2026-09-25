import type { PaymentMethod } from '../models';
import { requireChoice, requireDate, requireMoney, requireNumber } from '../validation';
import { requireRule } from '../errors';

export function validateCollection(amount: number, date: string, method: PaymentMethod = 'cash') {
  requireMoney(amount, true);
  requireDate(date);
  requireChoice(method, ['cash', 'wallet', 'instapay', 'card', 'bank', 'other'], 'طريقة الدفع غير صحيحة');
}
export function validateEnrollmentInput(payment: number | undefined, options: {
  startSession?: number; priceOverride?: number; discountAmount?: number; discountPercent?: number; paymentMethod?: PaymentMethod;
} = {}) {
  if (payment !== undefined) requireMoney(payment);
  if (options.startSession !== undefined) requireNumber(options.startSession, 'رقم الحصة غير صحيح', 1, true);
  if (options.priceOverride !== undefined) requireMoney(options.priceOverride);
  if (options.discountAmount !== undefined) requireMoney(options.discountAmount);
  if (options.discountPercent !== undefined) {
    requireNumber(options.discountPercent, 'نسبة الخصم غير صحيحة');
    requireRule(options.discountPercent <= 100, 'نسبة الخصم غير صحيحة');
  }
  if (options.paymentMethod !== undefined) requireChoice(options.paymentMethod, ['cash', 'wallet', 'instapay', 'card', 'bank', 'other'], 'طريقة الدفع غير صحيحة');
}
