import { describe, expect, it } from 'vitest';
import type { Course, Expense, Payment, Refund } from '../domain/models';
import { reportCharts } from '../domain/reporting/charts';
import { dailyReport } from '../domain/reporting/daily';
import { dashboardFinance, dateRange, financialSummary, monthlyFinance, revenueGrowth } from '../domain/reporting/finance';
import { payrollGroup, payrollStudent, payrollTeacher, PAYROLL_NOW } from './helpers/payroll';

const today = '2026-01-01';
function payment(overrides: Partial<Payment> = {}): Payment {
  return { id: 'p1', studentId: 's1', amount: 100, type: 'subscription', status: 'paid', date: today, createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides };
}
function refund(overrides: Partial<Refund> = {}): Refund {
  return { id: 'r1', studentId: 's1', paymentId: 'p1', amount: 30, date: today, method: 'cash', reason: 'Synthetic refund', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides };
}
function expense(overrides: Partial<Expense> = {}): Expense {
  return { id: 'e1', amount: 20, date: today, description: 'Synthetic expense', category: 'rent', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW, ...overrides };
}
const sample = () => ({
  payments: [payment(), payment({ id: 'p2', amount: 40, type: 'books', method: 'wallet' }), payment({ id: 'pending', amount: 60, status: 'pending' }), payment({ id: 'late', amount: 80, status: 'late' }), payment({ id: 'voided', amount: 900, voided: true }), payment({ id: 'deleted', amount: 800, deleted: true })],
  refunds: [refund(), refund({ id: 'deleted', amount: 700, deleted: true })],
  expenses: [expense(), expense({ id: 'deleted', amount: 500, deleted: true })],
});

describe('shared reporting finance (not teacher entitlement)', () => {
  it('counts only paid nonvoided/nondeleted payments and keeps method totals gross', () => {
    expect(financialSummary(sample(), dateRange(today, today), 'signed')).toMatchObject({
      grossRevenue: 140, refunds: 30, revenue: 110, expenses: 20, profit: 90,
      paymentCount: 2, refundCount: 1, expenseCount: 1, byMethod: { cash: 100, wallet: 40 },
    });
  });
  it('keeps inclusive range boundaries, excludes other dates, and never mutates input', () => {
    const data = sample();
    data.payments.push(payment({ id: 'previous', date: '2025-12-31' }), payment({ id: 'later', date: '2026-01-02' }));
    const before = structuredClone(data);
    expect(financialSummary(data, dateRange(today, today), 'signed').grossRevenue).toBe(140);
    expect(data).toEqual(before);
  });
  it('preserves signed range reports but clamps daily/monthly/dashboard revenue, not profit', () => {
    const data = { payments: [payment()], refunds: [refund({ amount: 150 })], expenses: [expense()] };
    expect(financialSummary(data, () => true, 'signed')).toMatchObject({ revenue: -50, profit: -70 });
    expect(financialSummary(data, () => true, 'nonnegative')).toMatchObject({ revenue: 0, profit: -20 });
    expect(dailyReport(data, today)).toMatchObject({ todayRevenue: 0, todayProfit: -20 });
    expect(monthlyFinance(data, today).at(-1)).toMatchObject({ revenue: 0, profit: -20 });
    expect(dashboardFinance(data, today).totalRevenue).toBe(0);
  });
  it.each([[100, 0, 100], [0, 0, 0], [0, 100, -100], [120, 80, 50], [130, 80, 62.5]])('growth %s versus %s remains %s', (current, previous, expected) => {
    expect(revenueGrowth(current, previous)).toBe(expected);
  });
  it('uses the refund month, includes empty months, and crosses years chronologically', () => {
    const data = { payments: [payment({ date: '2025-12-31', amount: 80 }), payment({ amount: 130 })], refunds: [refund({ date: '2025-12-01', amount: 10 })] };
    const months = monthlyFinance(data, today);
    expect(months.map(row => row.period)).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    expect(months.map(row => row.revenue)).toEqual([0, 0, 0, 0, 70, 130]);
    expect(dashboardFinance(data, today).growthRate).toBeCloseTo(85.7142857);
  });
  it('preserves pending/late counts and daily paid-versus-all table count semantics', () => {
    const daily = dailyReport(sample(), today);
    expect(daily).toMatchObject({ todayRevenue: 110, todayPending: 60, todayLate: 80, paidPaymentsCount: 2, totalPaymentsCount: 5 });
    expect(daily.statusData).toEqual([{ name: 'مدفوع', value: 2, amount: 110 }, { name: 'معلق', value: 1, amount: 60 }, { name: 'متأخر', value: 1, amount: 80 }]);
    expect(daily.typeData).toEqual([{ name: 'اشتراكات', value: 100 }, { name: 'كتب', value: 40 }]);
    expect(dashboardFinance(sample(), today)).toMatchObject({ pendingPayments: 2, pendingAmount: 140 });
  });
  it('compares to yesterday net of refunds and ends the 7-day trend on the selected day', () => {
    const data = sample();
    data.payments.push(payment({ date: '2025-12-31', amount: 80 }));
    data.refunds.push(refund({ date: '2025-12-31', amount: 20 }));
    const result = dailyReport(data, today);
    expect(result.revenueChange).toBe(83);
    expect(result.last7Days).toHaveLength(7);
    expect(result.last7Days.at(-1)).toMatchObject({ date: '01/01', revenue: 110, expense: 20, profit: 90 });
    expect(result.last7Days.at(-2)).toMatchObject({ date: '12/31', revenue: 60 });
  });
  it('returns empty rather than misleading positive chart slices for an empty day', () => {
    expect(dailyReport(sample(), '2026-02-01')).toMatchObject({ todayRevenue: 0, paidPaymentsCount: 0, statusData: [], typeData: [], revenueChange: 0 });
  });
});

describe('report chart selectors', () => {
  const course: Course = { id: 'course-1', name: 'Synthetic long course name for chart', category: 'test', price: 200, durationMonths: 1, levels: [], color: '#000000', icon: 'x', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW };
  it('preserves membership counts, truncation, zero capacity and all-time expense categories', () => {
    const data = {
      ...sample(), courses: [course], teachers: [payrollTeacher(), payrollTeacher({ id: 'unused' })],
      students: [payrollStudent({ age: 6 }), payrollStudent({ id: 's2', age: 7, gender: 'female', status: 'suspended' }), payrollStudent({ id: 's3', age: 19, status: 'ended' })],
      groups: [payrollGroup({ studentIds: ['s1', 's2'], maxStudents: 1 }), payrollGroup({ id: 'g2', studentIds: ['s1'], maxStudents: 0 })],
    };
    data.expenses.push(expense({ id: 'past', date: '2024-12-31', amount: 30 }));
    const before = structuredClone(data);
    const result = reportCharts(data, today);
    expect(result.courseData).toEqual([{ name: course.name.substring(0, 18) + '…', students: 3 }]);
    expect(result.groupFillData.map(row => row.fill)).toEqual([200, 0]);
    expect(result.teacherData).toHaveLength(1);
    expect(result.teacherData[0]).toMatchObject({ groups: 2, students: 3 });
    expect(result.genderData.map(row => row.value)).toEqual([2, 1]);
    expect(result.statusData.map(row => row.value)).toEqual([1, 1, 1]);
    expect(result.ageGroups.map(row => row.value)).toEqual([1, 1, 0, 0, 0]);
    expect(result.expensePieData).toEqual([{ name: 'إيجار', value: 50 }]);
    expect(result).not.toHaveProperty('profitability');
    expect(data).toEqual(before);
  });
});
