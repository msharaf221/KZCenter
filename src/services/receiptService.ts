import { readById } from '../data/readers';
import { allocateReceiptNumber } from '../data/receiptCounter';
import { writeTransaction } from '../data/transactions';
import { requireRule } from '../domain/errors';
import { counterValue, planReceiptBackfill, receiptYear } from '../domain/maintenance/receiptNumbers';
import { counterId, formatReceiptNo } from '../domain/receipts';

export function nextReceiptNo(date: string, prefix?: string): Promise<string> {
  return writeTransaction(['counters'], tx => allocateReceiptNumber(tx.objectStore('counters'), date, prefix));
}
export async function peekReceiptNo(date: string, prefix?: string): Promise<string> {
  const year = receiptYear(date);
  const existing = await readById('counters', counterId(date, prefix));
  return formatReceiptNo({ prefix: prefix || '', year, seq: existing ? counterValue(existing.value) : 0 });
}
/** Explicit manual correction retains the legacy floor/clamp behavior; invalid/unsafe numbers are rejected. */
export async function setReceiptCounter(date: string, value: number, prefix?: string): Promise<void> {
  receiptYear(date);
  requireRule(Number.isFinite(value), 'قيمة العداد غير صحيحة');
  const normalized = counterValue(Math.max(0, Math.floor(value)));
  return writeTransaction(['counters'], async tx => { await tx.objectStore('counters').put({ id: counterId(date, prefix), value: normalized, updatedAt: new Date().toISOString() }); });
}
export function backfillReceiptNumbers(prefix?: string): Promise<number> {
  return writeTransaction(['payments', 'counters'], async tx => {
    const [payments, counters] = await Promise.all([tx.objectStore('payments').getAll(), tx.objectStore('counters').getAll()]);
    const plan = planReceiptBackfill(payments, counters, prefix, new Date().toISOString());
    for (const row of plan.payments) await tx.objectStore('payments').put(row);
    for (const row of plan.counters) await tx.objectStore('counters').put(row);
    return plan.payments.length;
  });
}
