import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDB } from '../data/database';
import { dbPut } from '../data/records';
import { readAll, readSnapshot } from '../data/readers';
import { backfillReceiptNumbers, nextReceiptNo, peekReceiptNo, setReceiptCounter } from '../services/receiptService';
import { recordInstallmentPayment } from '../services/paymentService';
import { planReceiptBackfill } from '../domain/maintenance/receiptNumbers';
import { setSettingsCache } from '../lib/settings';
import { payrollStudent, PAYROLL_NOW } from './helpers/payroll';
import type { Payment } from '../domain/models';

const date = '2026-09-24';
const payment = (id: string, patch: Partial<Payment> = {}): Payment => ({ id, studentId: 'student-1', type: 'subscription', amount: 25, status: 'paid', date, createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...patch });
const snapshot = () => readSnapshot(['students', 'payments', 'installments', 'counters'], { includeDeleted: true });
beforeEach(async () => {
  setSettingsCache(null); const db = await getDB(); for (const name of db.objectStoreNames) await db.clear(name);
  await dbPut('students', payrollStudent({ enrolledGroups: [] }));
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });

describe('receipt maintenance shares the live allocator transaction scope', () => {
  it('rolls back every numbered payment when the last counter write fails', async () => {
    await dbPut('payments', payment('a')); await dbPut('payments', payment('b'));
    const before = await snapshot(), original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'counters') throw new DOMException('Synthetic counter failure', 'AbortError');
      return original.call(this, value, key);
    });
    await expect(backfillReceiptNumbers()).rejects.toBeDefined();
    expect(await snapshot()).toEqual(before);
  });
  it('plans and validates every legacy date before writing the first repair', async () => {
    await dbPut('payments', payment('a')); await dbPut('payments', payment('b', { date: 'not-a-date' }));
    const before = await snapshot();
    await expect(backfillReceiptNumbers()).rejects.toThrow('التاريخ');
    expect(await snapshot()).toEqual(before);
  });
  it('serializes two backfills without duplicate or skipped assignments', async () => {
    await dbPut('payments', payment('a')); await dbPut('payments', payment('b'));
    expect((await Promise.all([backfillReceiptNumbers(), backfillReceiptNumbers()])).sort()).toEqual([0, 2]);
    expect((await readAll('payments')).map(row => row.receiptNo)).toEqual(['2026-0001', '2026-0002']);
  });
  it.each([false, true])('cannot collide with a live collection (backfill first=%s)', async first => {
    await dbPut('payments', payment('a')); await dbPut('payments', payment('b'));
    const collect = () => recordInstallmentPayment({ studentId: 'student-1', amount: 10, date });
    if (first) await Promise.all([backfillReceiptNumbers(), collect()]); else await Promise.all([collect(), backfillReceiptNumbers()]);
    const numbers = (await readAll('payments')).map(row => row.receiptNo);
    expect(numbers.every(Boolean)).toBe(true); expect(new Set(numbers).size).toBe(3);
    expect((await readAll('counters'))[0].value).toBe(3);
  });
  it('keeps voided rows eligible and reserves existing numbers even from deleted payment history', async () => {
    await dbPut('payments', payment('deleted', { deleted: true, receiptNo: 'OTHER-2026-0050' }));
    await dbPut('payments', payment('voided', { voided: true }));
    await setReceiptCounter(date, 70, 'QA');
    expect(await backfillReceiptNumbers('QA')).toBe(1);
    expect((await readAll('payments'))[0]).toMatchObject({ receiptNo: 'QA-2026-0071', voided: true });
  });
  it('does not mutate arrays while constructing a multi-year repair plan', () => {
    const input = [payment('old', { date: '2025-12-01' }), payment('new')], before = structuredClone(input);
    const plan = planReceiptBackfill(input, [], 'QA', '2026-09-24T00:00:00Z');
    expect(input).toEqual(before); expect(plan.counters).toHaveLength(2);
    expect(plan.payments.map(row => row.receiptNo)).toEqual(['QA-2025-0001', 'QA-2026-0001']);
  });
});

describe('corrupt or exhausted counters fail closed', () => {
  it.each([NaN, Infinity, -1, 1.5, '4', Number.MAX_SAFE_INTEGER])('does not create a payment with unsafe receipt state: %s', async value => {
    await dbPut('counters', { id: 'receipt:2026', value, updatedAt: PAYROLL_NOW });
    const before = await snapshot();
    expect((await recordInstallmentPayment({ studentId: 'student-1', amount: 10, date })).success).toBe(false);
    expect(await snapshot()).toEqual(before);
  });
  it.each(['', '2026-02-31', 'invalid'])('rejects an invalid receipt date before allocating: %s', async invalid => {
    await expect(nextReceiptNo(invalid)).rejects.toThrow();
    await expect(peekReceiptNo(invalid)).rejects.toThrow();
    expect(await readAll('counters')).toEqual([]);
  });
  it('preserves explicit manual floor/clamp corrections but refuses nonfinite values', async () => {
    await setReceiptCounter(date, 3.9); expect(await nextReceiptNo(date)).toBe('2026-0004');
    await setReceiptCounter(date, -10); expect(await nextReceiptNo(date)).toBe('2026-0001');
    const before = await snapshot();
    await expect(setReceiptCounter(date, Infinity)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});
