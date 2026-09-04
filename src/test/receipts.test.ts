/**
 * اختبارات ترقيم الإيصالات التسلسلي — src/lib/receipts.ts
 *
 * قبل كده رقم الإيصال كان أول 6 حروف من UUID عشوائي:
 * مفيش تسلسل، مفيش طريقة تكتشف بيها إيصال ضايع، ومفيش مطابقة مع الدفتر الورقي.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatReceiptNo,
  parseReceiptNo,
  nextReceiptNo,
  peekReceiptNo,
  setReceiptCounter,
  backfillReceiptNumbers,
} from '../lib/receipts';
import { getDB, dbAdd, dbPut, dbGetAll, dbClearStore, generateId } from '../lib/db';
import type { Payment, Counter } from '../lib/db';

const DATE = '2026-03-10';

async function clearCounters(): Promise<void> {
  const db = await getDB();
  await db.clear('counters');
}

beforeEach(async () => {
  await clearCounters();
  await dbClearStore('payments');
});

describe('formatReceiptNo — الصياغة', () => {
  it('الصيغة الافتراضية: سنة-رقم', () => {
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 1 })).toBe('2026-0001');
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 42 })).toBe('2026-0042');
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 1234 })).toBe('2026-1234');
  });

  it('مع بادئة مخصصة', () => {
    expect(formatReceiptNo({ prefix: 'KZ', year: 2026, seq: 7 })).toBe('KZ-2026-0007');
    expect(formatReceiptNo({ prefix: 'BR1', year: 2026, seq: 7 })).toBe('BR1-2026-0007');
  });

  it('الرقم بيتحشى لـ 4 خانات', () => {
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 0 })).toBe('2026-0000');
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 9 })).toBe('2026-0009');
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 99999 })).toBe('2026-99999');
  });

  it('البادئة الفاضية/المسافات بتتجاهل', () => {
    expect(formatReceiptNo({ prefix: '   ', year: 2026, seq: 1 })).toBe('2026-0001');
    expect(formatReceiptNo({ prefix: ' KZ ', year: 2026, seq: 1 })).toBe('KZ-2026-0001');
  });

  it('رقم سالب أو كسري بيتظبط', () => {
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: -5 })).toBe('2026-0000');
    expect(formatReceiptNo({ prefix: '', year: 2026, seq: 3.9 })).toBe('2026-0003');
  });
});

describe('parseReceiptNo — قراءة الرقم', () => {
  it('بيفكك الرقم الافتراضي', () => {
    expect(parseReceiptNo('2026-0007')).toEqual({ prefix: '', year: 2026, seq: 7 });
  });

  it('بيفكك الرقم ببادئة', () => {
    expect(parseReceiptNo('KZ-2026-0007')).toEqual({ prefix: 'KZ', year: 2026, seq: 7 });
    expect(parseReceiptNo('BR1-2026-0042')).toEqual({ prefix: 'BR1', year: 2026, seq: 42 });
  });

  it('بيشيل الأصفار', () => {
    expect(parseReceiptNo('2026-0001')?.seq).toBe(1);
    expect(parseReceiptNo('2026-0100')?.seq).toBe(100);
  });

  it('رقم مش صالح = null', () => {
    expect(parseReceiptNo('')).toBeNull();
    expect(parseReceiptNo('abc')).toBeNull();
    expect(parseReceiptNo('2026')).toBeNull();
    expect(parseReceiptNo('26-0001')).toBeNull();
  });

  it('المسافات بتتشال', () => {
    expect(parseReceiptNo('  2026-0007  ')).toEqual({ prefix: '', year: 2026, seq: 7 });
  });

  it('round-trip: الصياغة ← القراءة ← نفس القيمة', () => {
    for (const parts of [
      { prefix: '', year: 2026, seq: 1 },
      { prefix: 'KZ', year: 2026, seq: 999 },
      { prefix: 'BR2', year: 2025, seq: 12 },
    ]) {
      expect(parseReceiptNo(formatReceiptNo(parts))).toEqual(parts);
    }
  });
});

describe('nextReceiptNo — الحجز التسلسلي', () => {
  it('أول رقم = 0001', async () => {
    expect(await nextReceiptNo(DATE)).toBe('2026-0001');
  });

  it('النداءات المتتالية بتزيد واحد واحد', async () => {
    expect(await nextReceiptNo(DATE)).toBe('2026-0001');
    expect(await nextReceiptNo(DATE)).toBe('2026-0002');
    expect(await nextReceiptNo(DATE)).toBe('2026-0003');
  });

  it('البادئة المخصصة ليها عدّاد مستقل', async () => {
    expect(await nextReceiptNo(DATE, 'KZ')).toBe('KZ-2026-0001');
    expect(await nextReceiptNo(DATE)).toBe('2026-0001');
    expect(await nextReceiptNo(DATE, 'KZ')).toBe('KZ-2026-0002');
    expect(await nextReceiptNo(DATE, 'BR1')).toBe('BR1-2026-0001');
  });

  it('كل سنة ليها عدّاد جديد', async () => {
    expect(await nextReceiptNo('2026-12-31')).toBe('2026-0001');
    expect(await nextReceiptNo('2026-12-31')).toBe('2026-0002');
    expect(await nextReceiptNo('2027-01-01')).toBe('2027-0001');
    expect(await nextReceiptNo('2026-06-01')).toBe('2026-0003');
  });

  it('الشهور المختلفة في نفس السنة بتكمل نفس العدّاد', async () => {
    expect(await nextReceiptNo('2026-01-05')).toBe('2026-0001');
    expect(await nextReceiptNo('2026-07-19')).toBe('2026-0002');
    expect(await nextReceiptNo('2026-12-31')).toBe('2026-0003');
  });

  it('العدّاد بيتحفظ في القاعدة (بيكمل بعد إعادة التحميل)', async () => {
    await nextReceiptNo(DATE);
    await nextReceiptNo(DATE);

    const db = await getDB();
    const rows = (await db.getAll('counters')) as Counter[];
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(2);
    expect(rows[0].updatedAt).toBeTruthy();
  });

  it('مفيش رقم بيتكرر', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) seen.add(await nextReceiptNo(DATE));
    expect(seen.size).toBe(25);
  });

  it('النداءات المتوازية ما بتكررش رقم (ترانزاكشن متسلسلة)', async () => {
    const results = await Promise.all([
      nextReceiptNo(DATE), nextReceiptNo(DATE), nextReceiptNo(DATE),
    ]);
    expect(new Set(results).size).toBe(3);
    expect(results.sort()).toEqual(['2026-0001', '2026-0002', '2026-0003']);
  });
});

describe('peekReceiptNo — آخر رقم من غير حجز', () => {
  it('مفيش عدّاد = صفر', async () => {
    expect(await peekReceiptNo(DATE)).toBe('2026-0000');
  });

  it('ما بيغيرش العدّاد', async () => {
    await nextReceiptNo(DATE);
    expect(await peekReceiptNo(DATE)).toBe('2026-0001');
    expect(await peekReceiptNo(DATE)).toBe('2026-0001');
    expect(await nextReceiptNo(DATE)).toBe('2026-0002');
  });

  it('بيحترم البادئة', async () => {
    await nextReceiptNo(DATE, 'KZ');
    expect(await peekReceiptNo(DATE, 'KZ')).toBe('KZ-2026-0001');
    expect(await peekReceiptNo(DATE)).toBe('2026-0000');
  });

  it('بيحترم السنة', async () => {
    await nextReceiptNo('2025-06-01');
    expect(await peekReceiptNo('2025-12-31')).toBe('2025-0001');
    expect(await peekReceiptNo('2026-01-01')).toBe('2026-0000');
  });
});

describe('setReceiptCounter — تظبيط يدوي', () => {
  it('بيغير بداية الترقيم (مطابقة الدفتر الورقي)', async () => {
    await setReceiptCounter(DATE, 500);
    expect(await peekReceiptNo(DATE)).toBe('2026-0500');
    expect(await nextReceiptNo(DATE)).toBe('2026-0501');
  });

  it('قيم سالبة/كسرية بتتظبط', async () => {
    await setReceiptCounter(DATE, -10);
    expect(await peekReceiptNo(DATE)).toBe('2026-0000');
    await setReceiptCounter(DATE, 12.9);
    expect(await peekReceiptNo(DATE)).toBe('2026-0012');
  });

  it('بيشتغل مع البادئة', async () => {
    await setReceiptCounter(DATE, 20, 'KZ');
    expect(await nextReceiptNo(DATE, 'KZ')).toBe('KZ-2026-0021');
    expect(await nextReceiptNo(DATE)).toBe('2026-0001');
  });

  it('صفر = يبدأ من جديد', async () => {
    await nextReceiptNo(DATE);
    await nextReceiptNo(DATE);
    await setReceiptCounter(DATE, 0);
    expect(await nextReceiptNo(DATE)).toBe('2026-0001');
  });
});

describe('backfillReceiptNumbers — ترقيم الدفعات القديمة', () => {
  function payment(o: Partial<Payment> = {}): Payment {
    return {
      id: o.id || generateId(),
      studentId: o.studentId || 's1',
      amount: o.amount ?? 100,
      type: o.type || 'subscription',
      status: o.status || 'paid',
      date: o.date || DATE,
      receiptNo: o.receiptNo,
      createdAt: o.createdAt || '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
    };
  }

  it('بيرقم الدفعات اللي مفيهاش رقم', async () => {
    await dbAdd('payments', payment({ date: '2026-01-05', createdAt: '2026-01-05T00:00:00.000Z' }));
    await dbAdd('payments', payment({ date: '2026-01-06', createdAt: '2026-01-06T00:00:00.000Z' }));

    const n = await backfillReceiptNumbers();
    expect(n).toBe(2);

    const rows = await dbGetAll<Payment>('payments');
    const nos = rows.map(r => r.receiptNo).sort();
    expect(nos).toEqual(['2026-0001', '2026-0002']);
  });

  it('مايلمسش الدفعات اللي عندها رقم بالفعل', async () => {
    await dbAdd('payments', payment({ receiptNo: 'KZ-2026-0007' }));
    await dbAdd('payments', payment());

    const n = await backfillReceiptNumbers();
    expect(n).toBe(1);

    const rows = await dbGetAll<Payment>('payments');
    expect(rows.filter(r => r.receiptNo === 'KZ-2026-0007')).toHaveLength(1);
  });

  it('مفيش دفعات = صفر', async () => {
    expect(await backfillReceiptNumbers()).toBe(0);
  });

  it('الترتيب بالتاريخ ثم وقت الإنشاء', async () => {
    await dbAdd('payments', payment({ date: '2026-03-01', createdAt: '2026-03-01T10:00:00.000Z' }));
    await dbAdd('payments', payment({ date: '2026-01-01', createdAt: '2026-01-01T10:00:00.000Z' }));
    await dbAdd('payments', payment({ date: '2026-02-01', createdAt: '2026-02-01T10:00:00.000Z' }));

    await backfillReceiptNumbers();
    const rows = (await dbGetAll<Payment>('payments')).sort((a, b) => a.date.localeCompare(b.date));
    expect(rows.map(r => `${r.date}:${r.receiptNo}`)).toEqual([
      '2026-01-01:2026-0001',
      '2026-02-01:2026-0002',
      '2026-03-01:2026-0003',
    ]);
  });

  it('بيكمل من العدّاد الموجود (ما يبدأش من 1)', async () => {
    await setReceiptCounter('2026-06-01', 100);
    await dbAdd('payments', payment({ date: '2026-06-01' }));

    await backfillReceiptNumbers();
    const [row] = await dbGetAll<Payment>('payments');
    expect(row.receiptNo).toBe('2026-0101');
  });

  it('البادئة المخصصة بتتطبق', async () => {
    await dbAdd('payments', payment());
    await backfillReceiptNumbers('KZ');
    const [row] = await dbGetAll<Payment>('payments');
    expect(row.receiptNo).toBe('KZ-2026-0001');
  });

  it('الدفعات الملغاة بتترقم برضه (الأثر محتاج رقم)', async () => {
    await dbAdd('payments', payment({ voided: true }));
    const n = await backfillReceiptNumbers();
    expect(n).toBe(1);
  });

  it('updatedAt بيتحدث بعد الترقيم', async () => {
    const p = payment({ updatedAt: '2020-01-01T00:00:00.000Z' });
    await dbAdd('payments', p);
    await backfillReceiptNumbers();

    const [row] = await dbGetAll<Payment>('payments');
    expect(row.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('ترقيم رجعي مرتين ما يكررش الأرقام', async () => {
    await dbAdd('payments', payment({ date: '2026-01-01' }));
    await dbAdd('payments', payment({ date: '2026-01-02' }));
    await backfillReceiptNumbers();
    await dbAdd('payments', payment({ date: '2026-01-03' }));
    await backfillReceiptNumbers();

    const rows = await dbGetAll<Payment>('payments');
    const nos = rows.map(r => r.receiptNo);
    expect(new Set(nos).size).toBe(3);
    expect(nos.sort()).toEqual(['2026-0001', '2026-0002', '2026-0003']);
  });

  it('دفعات سنين مختلفة بياخدوا أرقام سنينهم', async () => {
    await dbAdd('payments', payment({ date: '2025-11-01', createdAt: '2025-11-01T00:00:00.000Z' }));
    await dbAdd('payments', payment({ date: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' }));
    await backfillReceiptNumbers();

    const rows = await dbGetAll<Payment>('payments');
    const r2025 = rows.find(r => r.date.startsWith('2025'))!;
    const r2026 = rows.find(r => r.date.startsWith('2026'))!;
    expect(r2025.receiptNo).toMatch(/^2025-\d{4}$/);
    expect(r2026.receiptNo).toMatch(/^2026-\d{4}$/);
  });
});

describe('التكامل: الحجز ما يتعارضش مع الدفعات المخزنة', () => {
  it('بعد الترقيم الرجعي، الرقم التالي يكمل من الآخر', async () => {
    await dbAdd('payments', {
      id: 'p1', studentId: 's1', amount: 100, type: 'subscription', status: 'paid',
      date: DATE, createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
    } satisfies Payment);
    await backfillReceiptNumbers();

    expect(await nextReceiptNo(DATE)).toBe('2026-0002');
  });

  it('dbPut ما بيكسرش العدّاد', async () => {
    const no = await nextReceiptNo(DATE);
    await dbPut('counters', { id: 'receipt:2026', value: 7, updatedAt: new Date().toISOString() } satisfies Counter);
    expect(await nextReceiptNo(DATE)).toBe('2026-0008');
    expect(no).toBe('2026-0001');
  });
});
