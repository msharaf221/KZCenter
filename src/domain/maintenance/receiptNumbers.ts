import dayjs from 'dayjs';
import { requireRule } from '../errors';
import type { Counter, Payment } from '../models';
import { counterId, formatReceiptNo, parseReceiptNo, RECEIPT_COUNTER_PREFIX } from '../receipts';
import { requireDate } from '../validation';

/** Accept legacy ISO timestamps as well as date-only values; never emit a NaN year or unsafe sequence. */
export function receiptYear(date: string): number {
  requireRule(typeof date === 'string', 'تاريخ الإيصال غير صحيح');
  requireDate(date.slice(0, 10));
  const year = dayjs(date).year();
  requireRule(Number.isInteger(year) && year >= 1900 && year <= 9999, 'تاريخ الإيصال غير صحيح');
  return year;
}
export function counterValue(value: unknown): number {
  requireRule(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'عداد الإيصالات غير صالح؛ راجعه قبل تسجيل دفعة جديدة');
  return value;
}
export function nextCounterValue(value: unknown): number {
  const current = counterValue(value);
  requireRule(current < Number.MAX_SAFE_INTEGER, 'وصل عداد الإيصالات للحد المسموح');
  return current + 1;
}

/** Keep historic ordering and max-receipt behavior, including voided rows and numbers on tombstones. */
export function planReceiptBackfill(payments: Payment[], counters: Counter[], prefix: string | undefined, now: string) {
  const missing = payments.filter(row => !row.deleted && !row.receiptNo)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const years = new Map(missing.map(row => [row.id, receiptYear(row.date || row.createdAt)]));
  const neededYears = new Set(years.values()), byYear = new Map<number, number>();
  for (const row of payments) {
    const parsed = row.receiptNo ? parseReceiptNo(row.receiptNo) : null;
    if (parsed && neededYears.has(parsed.year)) byYear.set(parsed.year, Math.max(byYear.get(parsed.year) || 0, counterValue(parsed.seq)));
  }
  const wantedPrefix = (prefix || '').trim();
  for (const row of counters) {
    if (!row.id.startsWith(RECEIPT_COUNTER_PREFIX)) continue;
    const tail = row.id.slice(RECEIPT_COUNTER_PREFIX.length), sep = tail.lastIndexOf('-');
    const counterPrefix = sep === -1 ? '' : tail.slice(0, sep), year = Number(sep === -1 ? tail : tail.slice(sep + 1));
    if (counterPrefix !== wantedPrefix || !neededYears.has(year)) continue;
    byYear.set(year, Math.max(byYear.get(year) || 0, counterValue(row.value)));
  }
  const paymentPatches: Payment[] = [], counterPatches = new Map<string, Counter>();
  for (const row of missing) {
    const year = years.get(row.id)!, value = nextCounterValue(byYear.get(year) || 0);
    byYear.set(year, value);
    paymentPatches.push({ ...row, receiptNo: formatReceiptNo({ prefix: prefix || '', year, seq: value }), method: row.method || 'cash', updatedAt: now });
    const id = counterId(row.date || row.createdAt, prefix);
    counterPatches.set(id, { id, value, updatedAt: now });
  }
  return { payments: paymentPatches, counters: [...counterPatches.values()] };
}
