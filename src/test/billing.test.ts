/**
 * اختبارات منطق المستحقات والأقساط (دوال نقية — src/lib/billing.ts)
 */
import { describe, it, expect } from 'vitest';
import {
  SESSIONS_PER_MONTH,
  buildMonthlyPlan,
  sessionPrice,
  proratedFirstPeriod,
  applyPayment,
  installmentRemaining,
  installmentState,
  isOverdue,
  summarize,
  computeBalance,
  distributePaid,
  Installment,
} from '../lib/billing';

const TODAY = '2026-03-10';

function makeInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: overrides.id || `inst-${Math.random().toString(36).slice(2)}`,
    studentId: 's1',
    groupId: 'g1',
    periodIndex: 1,
    periodLabel: 'الشهر 1 من 3',
    amount: 800,
    paidAmount: 0,
    dueDate: '2026-01-15',
    status: 'pending',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildMonthlyPlan', () => {
  it('يولّد قسط لكل شهر بقيمة السعر الشهري', () => {
    const plan = buildMonthlyPlan({ coursePrice: 800, durationMonths: 3, startDate: '2026-01-15' });
    expect(plan).toHaveLength(3);
    expect(plan.map(p => p.amount)).toEqual([800, 800, 800]);
    expect(plan.map(p => p.dueDate)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    expect(plan.map(p => p.periodIndex)).toEqual([1, 2, 3]);
    expect(plan[0].periodLabel).toBe('الشهر 1 من 3');
  });

  it('مدة صفر أو سالبة → قسط واحد على الأقل', () => {
    expect(buildMonthlyPlan({ coursePrice: 500, durationMonths: 0, startDate: '2026-01-01' })).toHaveLength(1);
    expect(buildMonthlyPlan({ coursePrice: 500, durationMonths: -2, startDate: '2026-01-01' })).toHaveLength(1);
  });

  it('يتجاوز قيمة القسط الأول (للالتحاق في نص الكورس)', () => {
    const plan = buildMonthlyPlan({
      coursePrice: 800,
      durationMonths: 2,
      startDate: '2026-01-15',
      firstPeriodAmount: 600,
    });
    expect(plan.map(p => p.amount)).toEqual([600, 800]);
  });
});

describe('التسعير بالحصص', () => {
  it('عدد الحصص في الشهر ثابت = 8', () => {
    expect(SESSIONS_PER_MONTH).toBe(8);
  });

  it('سعر الحصة = السعر الشهري ÷ 8', () => {
    expect(sessionPrice(800)).toBe(100);
    expect(sessionPrice(0)).toBe(0);
  });

  it('طالب دخل من الحصة التالتة يدفع 6 حصص بس من الشهر الأول', () => {
    // 800 ÷ 8 = 100 للحصة → 6 حصص = 600
    expect(proratedFirstPeriod(800, 3)).toBe(600);
    expect(proratedFirstPeriod(800, 1)).toBe(800);   // من الأول: الشهر كامل
    expect(proratedFirstPeriod(800, 8)).toBe(100);   // آخر حصة
    expect(proratedFirstPeriod(800, 99)).toBe(100);  // ما يعديش حدود الشهر
  });
});

describe('applyPayment — توزيع الدفعة على الأقساط', () => {
  it('دفعة جزئية تقفل القسط الأول وتسيب الباقي', () => {
    const installments = [
      makeInstallment({ id: 'a', amount: 800, dueDate: '2026-04-15', periodIndex: 1 }),
      makeInstallment({ id: 'b', amount: 800, dueDate: '2026-05-15', periodIndex: 2 }),
    ];
    const result = applyPayment(installments, 1000, TODAY);
    const a = result.installments.find(i => i.id === 'a')!;
    const b = result.installments.find(i => i.id === 'b')!;

    expect(a.paidAmount).toBe(800);
    expect(a.status).toBe('paid');
    expect(b.paidAmount).toBe(200);
    expect(b.status).toBe('partial');
    expect(result.applied).toBe(1000);
    expect(result.leftover).toBe(0);
    // المصفوفة الأصلية ما اتغيرتش
    expect(installments[0].paidAmount).toBe(0);
  });

  it('قسط مدفوع جزئياً وفات استحقاقه → متأخر (مش جزئي)', () => {
    const result = applyPayment(
      [makeInstallment({ id: 'a', amount: 800, dueDate: '2026-02-15' })],
      200,
      TODAY
    );
    expect(result.installments[0].status).toBe('late');
  });

  it('مبلغ أكبر من المستحق → فائض (leftover)', () => {
    const result = applyPayment([makeInstallment({ amount: 800 })], 1000, TODAY);
    expect(result.applied).toBe(800);
    expect(result.leftover).toBe(200);
  });

  it('الأقدم استحقاقاً بيتسدد الأول حتى لو الترتيب مختلف', () => {
    const installments = [
      makeInstallment({ id: 'later', amount: 500, dueDate: '2026-05-01' }),
      makeInstallment({ id: 'earlier', amount: 500, dueDate: '2026-01-01' }),
    ];
    const result = applyPayment(installments, 500, TODAY);
    expect(result.installments.find(i => i.id === 'earlier')!.status).toBe('paid');
    expect(result.installments.find(i => i.id === 'later')!.paidAmount).toBe(0);
  });

  it('الأقساط الملغاة ما تستلمش فلوس', () => {
    const result = applyPayment([
      makeInstallment({ id: 'x', amount: 500, status: 'cancelled' }),
    ], 500, TODAY);
    expect(result.applied).toBe(0);
    expect(result.leftover).toBe(500);
  });
});

describe('distributePaid — ترحيل المدفوع القديم', () => {
  it('يوزع إجمالي المدفوع على الخطة من الأقدم', () => {
    const plan = [
      makeInstallment({ id: 'a', amount: 800, dueDate: '2026-01-15' }),
      makeInstallment({ id: 'b', amount: 800, dueDate: '2026-02-15' }),
    ];
    const distributed = distributePaid(plan, 900, TODAY);
    expect(distributed[0].paidAmount).toBe(800);
    expect(distributed[1].paidAmount).toBe(100);
  });
});

describe('الحالات والتأخير', () => {
  it('قسط فات استحقاقه وفيه باقي → متأخر', () => {
    const late = makeInstallment({ dueDate: '2026-02-01', paidAmount: 0 });
    expect(installmentState(late, TODAY)).toBe('late');
    expect(isOverdue(late, TODAY)).toBe(true);
  });

  it('قسط مدفوع بالكامل → مسدد حتى لو فات تاريخه', () => {
    const paid = makeInstallment({ dueDate: '2026-02-01', amount: 800, paidAmount: 800 });
    expect(installmentState(paid, TODAY)).toBe('paid');
    expect(isOverdue(paid, TODAY)).toBe(false);
  });

  it('قسط مدفوع جزئياً قبل الاستحقاق → جزئي', () => {
    expect(installmentState(makeInstallment({ dueDate: '2026-04-01', paidAmount: 100 }), TODAY)).toBe('partial');
  });

  it('الملغي يفضل ملغي', () => {
    expect(installmentState(makeInstallment({ status: 'cancelled', dueDate: '2026-01-01' }), TODAY)).toBe('cancelled');
  });

  it('installmentRemaining ما يرجعش رقم سالب', () => {
    expect(installmentRemaining({ amount: 800, paidAmount: 900 })).toBe(0);
    expect(installmentRemaining({ amount: 800, paidAmount: 300 })).toBe(500);
  });
});

describe('summarize', () => {
  it('يجمع المستحق والمدفوع والمتأخر ويتجاهل الملغي', () => {
    const list = [
      makeInstallment({ amount: 800, paidAmount: 800, dueDate: '2026-01-15' }),
      makeInstallment({ amount: 800, paidAmount: 0, dueDate: '2026-02-15' }),
      makeInstallment({ amount: 800, paidAmount: 0, dueDate: '2026-03-15' }),
      makeInstallment({ amount: 800, paidAmount: 0, status: 'cancelled' }),
    ];
    const s = summarize(list, TODAY);
    expect(s.total).toBe(2400);
    expect(s.paid).toBe(800);
    expect(s.remaining).toBe(1600);
    expect(s.unpaidCount).toBe(2);
    expect(s.overdueCount).toBe(1);          // قسط فبراير بس (مارس لسه جاي)
    expect(s.overdueAmount).toBe(800);
  });
});

describe('computeBalance — رصيد الطالب', () => {
  it('المستحق = الأقساط + بنود غير الاشتراك، والمدفوع = الدفعات المسددة', () => {
    const balance = computeBalance({
      installments: [
        makeInstallment({ amount: 800, paidAmount: 800 }),
        makeInstallment({ amount: 800, paidAmount: 200 }),
      ],
      payments: [
        { amount: 1000, status: 'paid', type: 'subscription' },
        { amount: 150, status: 'paid', type: 'books' },      // كتاب مدفوع
        { amount: 100, status: 'pending', type: 'books' },   // كتاب لسه
        { amount: 500, status: 'pending', type: 'subscription' }, // وعد بالدفع مش محصّل
      ],
    });

    expect(balance.owed).toBe(1600 + 150 + 100);  // أقساط + الكتب
    expect(balance.paid).toBe(1150);
    expect(balance.remaining).toBe(700);
  });

  it('الأقساط الملغاة ما تدخلش في المستحق', () => {
    const balance = computeBalance({
      installments: [
        makeInstallment({ amount: 800, status: 'cancelled' }),
        makeInstallment({ amount: 800 }),
      ],
      payments: [],
    });
    expect(balance.owed).toBe(800);
    expect(balance.remaining).toBe(800);
  });
});
