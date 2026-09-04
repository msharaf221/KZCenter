/**
 * اختبارات الخزينة — إجماليات اليوم وجلسات الصندوق (دوال نقية في src/lib/cashbox.ts)
 *
 * أهم معادلة: الرصيد المتوقع في الدرج =
 *   رصيد أول اليوم + النقدية المقبوضة − الاستردادات − المصروفات النقدية
 */
import { describe, it, expect } from 'vitest';
import { computeDayTotals, METHOD_ORDER, METHOD_LABEL } from '../lib/cashbox';
import type { Payment, Refund, Expense, PaymentMethod } from '../lib/db';

const DATE = '2026-03-10';

function pay(o: Partial<Payment> = {}): Payment {
  return {
    id: o.id || `p-${Math.random().toString(36).slice(2)}`,
    studentId: o.studentId || 's1',
    amount: o.amount ?? 100,
    type: o.type || 'subscription',
    status: o.status || 'paid',
    date: o.date || DATE,
    method: o.method,
    collectedBy: o.collectedBy,
    collectedByName: o.collectedByName,
    voided: o.voided,
    deleted: o.deleted,
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  };
}

function refund(o: Partial<Refund> = {}): Refund {
  return {
    id: o.id || `r-${Math.random().toString(36).slice(2)}`,
    studentId: o.studentId || 's1',
    amount: o.amount ?? 50,
    reason: o.reason || 'انسحاب',
    method: o.method,
    date: o.date || DATE,
    deleted: o.deleted,
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  };
}

function expense(o: Partial<Expense> = {}): Expense {
  return {
    id: o.id || `e-${Math.random().toString(36).slice(2)}`,
    category: o.category || 'purchases',
    amount: o.amount ?? 30,
    description: o.description || 'مشتريات',
    date: o.date || DATE,
    method: o.method,
    deleted: o.deleted,
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  };
}

describe('computeDayTotals — التحصيل', () => {
  it('يوم فاضي = أصفار', () => {
    const t = computeDayTotals({ date: DATE, payments: [], refunds: [], expenses: [] });
    expect(t.collected).toBe(0);
    expect(t.paymentsCount).toBe(0);
    expect(t.refunds).toBe(0);
    expect(t.expenses).toBe(0);
    expect(t.expectedCash).toBe(0);
    expect(t.byCollector).toHaveLength(0);
  });

  it('بيجمع المدفوع المسدد بس', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 800 }), pay({ amount: 200 }), pay({ amount: 999, status: 'pending' })],
      refunds: [], expenses: [],
    });
    expect(t.collected).toBe(1000);
    expect(t.paymentsCount).toBe(2);
  });

  it('الملغاة والمحذوفة ما تدخلش', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 100 }), pay({ amount: 100, voided: true }), pay({ amount: 100, deleted: true })],
      refunds: [], expenses: [],
    });
    expect(t.collected).toBe(100);
    expect(t.paymentsCount).toBe(1);
  });

  it('يوم تاني ما يدخلش', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 100 }), pay({ amount: 100, date: '2026-03-09' })],
      refunds: [], expenses: [],
    });
    expect(t.collected).toBe(100);
  });
});

describe('computeDayTotals — التفصيل بطريقة الدفع', () => {
  it('كل الطرق موجودة (حتى لو صفر)', () => {
    const t = computeDayTotals({ date: DATE, payments: [], refunds: [], expenses: [] });
    for (const m of METHOD_ORDER) expect(t.byMethod[m]).toBe(0);
  });

  it('بيوزع المبالغ على الطرق', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [
        pay({ amount: 500, method: 'cash' }),
        pay({ amount: 300, method: 'cash' }),
        pay({ amount: 200, method: 'wallet' }),
        pay({ amount: 1000, method: 'instapay' }),
        pay({ amount: 400, method: 'card' }),
      ],
      refunds: [], expenses: [],
    });
    expect(t.byMethod.cash).toBe(800);
    expect(t.byMethod.wallet).toBe(200);
    expect(t.byMethod.instapay).toBe(1000);
    expect(t.byMethod.card).toBe(400);
    expect(t.byMethod.bank).toBe(0);
    expect(t.collected).toBe(2400);   // 500+300+200+1000+400
  });

  it('طريقة مش محددة = نقدي (الافتراضي)', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 250 })],
      refunds: [], expenses: [],
    });
    expect(t.byMethod.cash).toBe(250);
  });

  it('طريقة غير معروفة ما تكسرش الجمع', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 100, method: 'cheque' as PaymentMethod })],
      refunds: [], expenses: [],
    });
    expect(t.collected).toBe(100);
  });
});

describe('computeDayTotals — تحصيل كل موظف', () => {
  it('بيجمع لكل موظف بالعدد', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [
        pay({ amount: 500, collectedBy: 'u1', collectedByName: 'منى' }),
        pay({ amount: 300, collectedBy: 'u1', collectedByName: 'منى' }),
        pay({ amount: 200, collectedBy: 'u2', collectedByName: 'سارة' }),
      ],
      refunds: [], expenses: [],
    });
    expect(t.byCollector).toHaveLength(2);
    expect(t.byCollector[0]).toMatchObject({ userId: 'u1', name: 'منى', amount: 800, count: 2 });
    expect(t.byCollector[1]).toMatchObject({ userId: 'u2', name: 'سارة', amount: 200, count: 1 });
  });

  it('مرتّب من الأعلى تحصيلاً', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [
        pay({ amount: 100, collectedBy: 'a', collectedByName: 'أ' }),
        pay({ amount: 900, collectedBy: 'b', collectedByName: 'ب' }),
        pay({ amount: 500, collectedBy: 'c', collectedByName: 'ج' }),
      ],
      refunds: [], expenses: [],
    });
    expect(t.byCollector.map(c => c.userId)).toEqual(['b', 'c', 'a']);
  });

  it('من غير موظف محدد = «غير محدد»', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 100 })],
      refunds: [], expenses: [],
    });
    expect(t.byCollector[0].name).toBe('غير محدد');
    expect(t.byCollector[0].amount).toBe(100);
  });

  it('اسم الموظف بيرجع للـ userId لو الاسم مش مكتوب', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 100, collectedBy: 'u9' })],
      refunds: [], expenses: [],
    });
    expect(t.byCollector[0].name).toBe('مستخدم');
  });
});

describe('computeDayTotals — الرصيد المتوقع في الدرج', () => {
  it('= رصيد أول اليوم + النقدية − الاستردادات − المصروف النقدي', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [
        pay({ amount: 800, method: 'cash' }),
        pay({ amount: 1000, method: 'instapay' }),  // مش نقدية → ما تدخلش الدرج
      ],
      refunds: [refund({ amount: 200 })],
      expenses: [expense({ amount: 150, method: 'cash' }), expense({ amount: 400, method: 'bank' })],
      openingBalance: 500,
    });
    // 500 + 800 − 200 − 150 = 950
    expect(t.collected).toBe(1800);
    expect(t.refunds).toBe(200);
    expect(t.expenses).toBe(550);
    expect(t.cashExpenses).toBe(150);
    expect(t.expectedCash).toBe(950);
  });

  it('من غير رصيد افتتاحي', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 300, method: 'cash' })],
      refunds: [], expenses: [],
    });
    expect(t.expectedCash).toBe(300);
  });

  it('كله إلكتروني = الدرج ما بيتغيرش', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 2000, method: 'card' }), pay({ amount: 500, method: 'wallet' })],
      refunds: [], expenses: [], openingBalance: 100,
    });
    expect(t.collected).toBe(2500);
    expect(t.expectedCash).toBe(100);
  });

  it('استردادات يوم تاني ما تخصمش', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 500, method: 'cash' })],
      refunds: [refund({ amount: 100, date: '2026-03-09' })],
      expenses: [],
    });
    expect(t.refunds).toBe(0);
    expect(t.expectedCash).toBe(500);
  });

  it('استرداد محذوف ما يخصمش', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [pay({ amount: 500, method: 'cash' })],
      refunds: [refund({ amount: 100, deleted: true })],
      expenses: [],
    });
    expect(t.refunds).toBe(0);
    expect(t.expectedCash).toBe(500);
  });

  it('مصروف من غير طريقة محددة = نقدي', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [],
      refunds: [],
      expenses: [expense({ amount: 80 })],
      openingBalance: 200,
    });
    expect(t.cashExpenses).toBe(80);
    expect(t.expectedCash).toBe(120);
  });

  it('الدرج ممكن يبقى سالب (صرف أكتر من الموجود)', () => {
    const t = computeDayTotals({
      date: DATE,
      payments: [],
      refunds: [],
      expenses: [expense({ amount: 500, method: 'cash' })],
      openingBalance: 100,
    });
    expect(t.expectedCash).toBe(-400);
  });
});

describe('METHOD_LABEL / METHOD_ORDER', () => {
  it('كل طريقة ليها تسمية عربية', () => {
    for (const m of METHOD_ORDER) {
      expect(METHOD_LABEL[m]).toBeTruthy();
      expect(typeof METHOD_LABEL[m]).toBe('string');
    }
  });

  it('الترتيب بيبدأ بالنقدي (الأهم للمطابقة)', () => {
    expect(METHOD_ORDER[0]).toBe('cash');
    expect(METHOD_ORDER).toHaveLength(6);
  });
});
