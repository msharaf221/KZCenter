import dayjs from 'dayjs';
import { requireRule } from './errors';
import { isDeleted } from './recordState';

export function requireText(value: string, message: string): void {
  requireRule(typeof value === 'string' && value.trim().length > 0, message);
}

export function requireNumber(value: number, message: string, minimum = 0, integer = false): void {
  requireRule(Number.isFinite(value) && value >= minimum && (!integer || Number.isInteger(value)), message);
}

export function requireMoney(value: number, positive = false): void {
  requireNumber(value, 'المبلغ غير صحيح', 0);
  requireRule(!positive || value > 0, 'المبلغ يجب أن يكون أكبر من صفر');
  requireRule(Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'المبلغ لا يقبل أكثر من منزلتين عشريتين');
}

export function requireDate(value: string): void {
  requireRule(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      dayjs(value).isValid() &&
      dayjs(value).format('YYYY-MM-DD') === value,
    'التاريخ غير صحيح',
  );
}

export function requireChoice<T extends string>(value: T, choices: readonly NoInfer<T>[], message: string): void {
  requireRule(choices.includes(value), message);
}

export function requireLive<T>(row: T | undefined, message: string): T {
  requireRule(row && !isDeleted(row), message);
  return row;
}
