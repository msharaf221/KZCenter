/**
 * اختبارات إضافات الفوترة (v7):
 *  - يوم استحقاق موحّد + أيام سماح
 *  - عدد الحصص في الشهر (مش ثابت على 8)
 *  - الخصومات وتجاوز السعر
 *  - الدفعات الملغاة والاستردادات في الرصيد
 *  - الرصيد الدائن
 *  - أعمار الديون والاستحقاقات القريبة
 */
import { describe, it, expect } from 'vitest';
import {
  computeDueDate,
  resolveSessionsPerMonth,
  effectiveMonthlyPrice,
  discountBreakdown,
  isCountedPayment,
  computeBalance,
  creditOf,
  debtAging,
  upcomingDues,
  AGING_RANGES,
  type Installment,
} from '../lib/billing';

const TODAY = '2026-03-10';

function makeInstallment(o: Partial<Installment> = {}): Installment {
  return {
    id: o.id || `i-${Math.random().toString(36).slice(2)}`,
    studentId: o.studentId || 's1',
    groupId: o.groupId || 'g1',
    periodIndex: o.periodIndex ?? 1,
    periodLabel: o.periodLabel || 'الشهر 1',
    amount: o.amount ?? 800,
    paidAmount: o.paidAmount ?? 0,
    dueDate: o.dueDate || TODAY,
    status: o.status || 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: o.deleted,
  };
}

describe('computeDueDate — يوم الاستحقاق الموحّد', () => {
  it('من غير يوم موحّد: الاستحقاق = تاريخ التسجيل + شهر (السلوك القديم)', () => {
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 0 })).toBe('2026-01-15');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 1 })).toBe('2026-02-15');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 2 })).toBe('2026-03-15');
  });

  it('مع يوم موحّد: كل الأقساط في نفس اليوم من شهرها', () => {
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 0, dueDayOfMonth: 5 })).toBe('2026-02-05');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 1, dueDayOfMonth: 5 })).toBe('2026-02-05');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 2, dueDayOfMonth: 5 })).toBe('2026-03-05');
  });

  it('القسط الأول بيترحل للشهر التالي لو اليوم الموحّد فات', () => {
    // التسجيل يوم 20 والموحّد يوم 5 → أول استحقاق 5 فبراير مش 5 يناير
    expect(computeDueDate({ startDate: '2026-01-20', periodOffset: 0, dueDayOfMonth: 5 })).toBe('2026-02-05');
  });

  it('القسط الأول ما بيترحلش لو اليوم الموحّد لسه جاي', () => {
    expect(computeDueDate({ startDate: '2026-01-02', periodOffset: 0, dueDayOfMonth: 5 })).toBe('2026-01-05');
  });

  it('أيام السماح بتتزاد على تاريخ الاستحقاق', () => {
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 0, graceDays: 5 })).toBe('2026-01-20');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 0, dueDayOfMonth: 5, graceDays: 3 }))
      .toBe('2026-02-08');
  });

  it('قيم اليوم الموحّد غير الصالحة بتتجاهل', () => {
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 1, dueDayOfMonth: 0 })).toBe('2026-02-15');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 1, dueDayOfMonth: 31 })).toBe('2026-02-15');
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: 1, dueDayOfMonth: null })).toBe('2026-02-15');
  });

  it('offset سالب بيتعامل معاه كصفر', () => {
    expect(computeDueDate({ startDate: '2026-01-15', periodOffset: -3 })).toBe('2026-01-15');
  });
});

describe('resolveSessionsPerMonth — عدد الحصص مش ثابت', () => {
  it('الافتراضي 8 لما مفيش أي مصدر', () => {
    expect(resolveSessionsPerMonth({})).toBe(8);
  });

  it('عدد حصص الكورس ليه الأولوية', () => {
    expect(resolveSessionsPerMonth({ courseSessionsPerMonth: 12, scheduleDays: [['saturday']] })).toBe(12);
  });

  it('من جدول المجموعة: يومين في الأسبوع × 4 أسابيع = 8', () => {
    expect(resolveSessionsPerMonth({ scheduleDays: [['saturday', 'tuesday']] })).toBe(8);
  });

  it('يوم واحد في الأسبوع = 4 حصص (مش 8)', () => {
    expect(resolveSessionsPerMonth({ scheduleDays: [['monday']] })).toBe(4);
  });

  it('ثلاث أيام = 12 حصة', () => {
    expect(resolveSessionsPerMonth({ scheduleDays: [['saturday'], ['monday'], ['wednesday']] })).toBe(12);
  });

  it('التكرار في الجدول ما بيضاعفش العدد', () => {
    expect(resolveSessionsPerMonth({ scheduleDays: [['saturday', 'saturday']] })).toBe(4);
  });

  it('الإعداد العام بيستخدم لما مفيش كورس ولا جدول', () => {
    expect(resolveSessionsPerMonth({ settingSessionsPerMonth: 6 })).toBe(6);
  });

  it('قيم فاسدة بتتجاهل', () => {
    expect(resolveSessionsPerMonth({ courseSessionsPerMonth: 0, settingSessionsPerMonth: -2 })).toBe(8);
    expect(resolveSessionsPerMonth({ scheduleDays: [[]] })).toBe(8);
  });
});

describe('effectiveMonthlyPrice — الخصومات وتجاوز السعر', () => {
  it('من غير خصومات = سعر الكورس', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 800 })).toBe(800);
  });

  it('تجاوز السعر بيحل محل سعر الكورس', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 800, priceOverride: 650 })).toBe(650);
  });

  it('خصم نسبة', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 800, discountPercent: 25 })).toBe(600);
  });

  it('خصم مبلغ', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 800, discountAmount: 100 })).toBe(700);
  });

  it('الترتيب: تجاوز ← نسبة ← مبلغ', () => {
    // 700 → خصم 10% = 630 → خصم 30 = 600
    expect(effectiveMonthlyPrice({ coursePrice: 900, priceOverride: 700, discountPercent: 10, discountAmount: 30 })).toBe(600);
  });

  it('ما ينزلش تحت الصفر', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 100, discountAmount: 500 })).toBe(0);
    expect(effectiveMonthlyPrice({ coursePrice: 100, discountPercent: 150 })).toBe(0);
  });

  it('النسبة محدودة بـ 100', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 800, discountPercent: 100 })).toBe(0);
  });

  it('تجاوز بصفر = مجاني (مش تجاهل)', () => {
    expect(effectiveMonthlyPrice({ coursePrice: 800, priceOverride: 0 })).toBe(0);
  });

  it('discountBreakdown بيوضح التوفير', () => {
    const b = discountBreakdown({ coursePrice: 800, discountPercent: 25, discountAmount: 50 });
    expect(b.base).toBe(800);
    expect(b.final).toBe(550);
    expect(b.saved).toBe(250);
    expect(b.byPercent).toBe(200);
    expect(b.byAmount).toBe(50);
  });
});

describe('isCountedPayment — إيه اللي يتحسب إيراد', () => {
  it('المدفوع السليم بس', () => {
    expect(isCountedPayment({ status: 'paid' })).toBe(true);
    expect(isCountedPayment({ status: 'pending' })).toBe(false);
    expect(isCountedPayment({ status: 'late' })).toBe(false);
  });

  it('الملغي والمحذوف ما يتحسبوش', () => {
    expect(isCountedPayment({ status: 'paid', voided: true })).toBe(false);
    expect(isCountedPayment({ status: 'paid', deleted: true })).toBe(false);
  });
});

describe('computeBalance — مع الإلغاء والاسترداد', () => {
  const installments = [makeInstallment({ amount: 800 }), makeInstallment({ amount: 800, periodIndex: 2 })];

  it('رصيد عادي', () => {
    const b = computeBalance({
      installments,
      payments: [{ amount: 800, status: 'paid', type: 'subscription' }],
    });
    expect(b).toEqual({ owed: 1600, paid: 800, remaining: 800 });
  });

  it('الدفعة الملغاة ما بتتحسبش', () => {
    const b = computeBalance({
      installments,
      payments: [
        { amount: 800, status: 'paid', type: 'subscription' },
        { amount: 800, status: 'paid', type: 'subscription', voided: true },
      ],
    });
    expect(b.paid).toBe(800);
    expect(b.remaining).toBe(800);
  });

  it('الاسترداد بيقلل المدفوع', () => {
    const b = computeBalance({
      installments,
      payments: [{ amount: 1600, status: 'paid', type: 'subscription' }],
      refunds: [{ amount: 300 }],
    });
    expect(b.paid).toBe(1300);
    expect(b.remaining).toBe(300);
  });

  it('الاسترداد المحذوف ما يتحسبش', () => {
    const b = computeBalance({
      installments,
      payments: [{ amount: 1600, status: 'paid', type: 'subscription' }],
      refunds: [{ amount: 300, deleted: true }],
    });
    expect(b.paid).toBe(1600);
  });

  it('المدفوع ما ينزلش تحت الصفر', () => {
    const b = computeBalance({
      installments: [],
      payments: [{ amount: 100, status: 'paid', type: 'subscription' }],
      refunds: [{ amount: 500 }],
    });
    expect(b.paid).toBe(0);
  });

  it('بنود الكتب/الأخرى بتتحسب مستحقات', () => {
    const b = computeBalance({
      installments: [],
      payments: [{ amount: 250, status: 'pending', type: 'books' }],
    });
    expect(b.owed).toBe(250);
    expect(b.remaining).toBe(250);
  });

  it('بند كتب ملغي ما يتحسبش مستحق', () => {
    const b = computeBalance({
      installments: [],
      payments: [{ amount: 250, status: 'pending', type: 'books', voided: true }],
    });
    expect(b.owed).toBe(0);
  });

  it('القسط الملغي ما يتحسبش مستحق', () => {
    const b = computeBalance({
      installments: [makeInstallment({ amount: 800, status: 'cancelled' })],
      payments: [],
    });
    expect(b.owed).toBe(0);
  });

  it('creditOf: الدفع الزايد يبقى رصيد للطالب', () => {
    const b = computeBalance({
      installments: [makeInstallment({ amount: 800 })],
      payments: [{ amount: 1000, status: 'paid', type: 'subscription' }],
    });
    expect(b.remaining).toBe(-200);
    expect(creditOf(b)).toBe(200);
  });

  it('creditOf = صفر لما فيه مديونية', () => {
    expect(creditOf({ remaining: 500 })).toBe(0);
    expect(creditOf({ remaining: 0 })).toBe(0);
  });
});

describe('debtAging — أعمار الديون', () => {
  it('بيقسم المتأخرات على الشرائح', () => {
    const rows = [
      makeInstallment({ dueDate: '2026-03-20' }),                  // لسه ما استحقش
      makeInstallment({ dueDate: '2026-03-01' }),                  // 9 أيام
      makeInstallment({ dueDate: '2026-01-20' }),                  // 49 يوم
      makeInstallment({ dueDate: '2025-11-01' }),                  // 129 يوم
    ];
    const buckets = debtAging(rows, TODAY);
    const get = (k: string) => buckets.find(b => b.key === k)!;

    expect(get('current').count).toBe(1);
    expect(get('current').amount).toBe(800);
    expect(get('d30').count).toBe(1);
    expect(get('d60').count).toBe(1);
    expect(get('d60').amount).toBe(800);
    expect(get('d90p').count).toBe(1);
  });

  it('المسدد والملغي والمحذوف ما يدخلوش', () => {
    const rows = [
      makeInstallment({ dueDate: '2026-03-01', paidAmount: 800, status: 'paid' }),
      makeInstallment({ dueDate: '2026-03-01', status: 'cancelled' }),
      makeInstallment({ dueDate: '2026-03-01', deleted: true }),
    ];
    const buckets = debtAging(rows, TODAY);
    expect(buckets.every(b => b.count === 0 && b.amount === 0)).toBe(true);
  });

  it('الدفع الجزئي بيحسب المتبقي بس', () => {
    const buckets = debtAging([makeInstallment({ dueDate: '2026-03-01', paidAmount: 300 })], TODAY);
    const d30 = buckets.find(b => b.key === 'd30')!;
    expect(d30.amount).toBe(500);
  });

  it('كل الشرائح موجودة دايماً (حتى لو صفر)', () => {
    const buckets = debtAging([], TODAY);
    expect(buckets.map(b => b.key)).toEqual(AGING_RANGES.map(r => r.key));
  });
});

describe('upcomingDues — استحقاقات قريبة', () => {
  it('بيلقط اللي استحقاقه داخل الأفق', () => {
    const rows = [
      makeInstallment({ dueDate: '2026-03-11' }),   // بكرة
      makeInstallment({ dueDate: '2026-03-13' }),   // بعد 3 أيام
      makeInstallment({ dueDate: '2026-03-20' }),   // بره الأفق
    ];
    const up = upcomingDues(rows, 3, TODAY);
    expect(up.count).toBe(2);
    expect(up.amount).toBe(1600);
    expect(up.items[0].daysUntilDue).toBe(1);
    expect(up.items[1].daysUntilDue).toBe(3);
  });

  it('المتأخر بالفعل ما يدخلش (مكانه في المديونيات)', () => {
    const up = upcomingDues([makeInstallment({ dueDate: '2026-03-01' })], 7, TODAY);
    expect(up.count).toBe(0);
  });

  it('المسدد ما يدخلش', () => {
    const up = upcomingDues(
      [makeInstallment({ dueDate: '2026-03-12', paidAmount: 800, status: 'paid' })],
      5, TODAY,
    );
    expect(up.count).toBe(0);
  });

  it('الدفع الجزئي بيحسب المتبقي', () => {
    const up = upcomingDues([makeInstallment({ dueDate: '2026-03-12', paidAmount: 500 })], 5, TODAY);
    expect(up.amount).toBe(300);
  });

  it('الاستحقاق النهاردة بيتحسب (daysUntilDue = 0)', () => {
    const up = upcomingDues([makeInstallment({ dueDate: TODAY })], 3, TODAY);
    expect(up.count).toBe(1);
    expect(up.items[0].daysUntilDue).toBe(0);
  });

  it('مرتّب حسب الأقرب استحقاقاً', () => {
    const up = upcomingDues([
      makeInstallment({ dueDate: '2026-03-14' }),
      makeInstallment({ dueDate: '2026-03-11' }),
      makeInstallment({ dueDate: '2026-03-12' }),
    ], 5, TODAY);
    expect(up.items.map(i => i.dueDate)).toEqual(['2026-03-11', '2026-03-12', '2026-03-14']);
  });

  it('أفق صفر = النهاردة بس', () => {
    const up = upcomingDues([
      makeInstallment({ dueDate: TODAY }),
      makeInstallment({ dueDate: '2026-03-11' }),
    ], 0, TODAY);
    expect(up.count).toBe(1);
  });
});
