import dayjs from 'dayjs';
import { isCountedPayment } from '../../lib/billing';
import type { Expense, Payment, Refund } from '../models';

export interface FinancialData {
  payments: readonly Payment[];
  refunds: readonly Refund[];
  expenses?: readonly Expense[];
}
export type DateFilter = (date: string) => boolean;
export type RevenuePolicy = 'signed' | 'nonnegative';

export function dateRange(from: string, to: string): DateFilter {
  return date => date >= from && date <= to;
}

/** Range reports allow negative net revenue; daily/dashboard/monthly charts historically clamp it. */
export function financialSummary(data: FinancialData, matches: DateFilter, policy: RevenuePolicy) {
  const countedPayments = data.payments.filter(row => isCountedPayment(row) && matches(row.date));
  const grossRevenue = countedPayments.reduce((sum, row) => sum + row.amount, 0);
  const refundRows = data.refunds.filter(row => !row.deleted && matches(row.date || ''));
  const refunds = refundRows.reduce((sum, row) => sum + (row.amount || 0), 0);
  const expenseRows = (data.expenses || []).filter(row => !row.deleted && matches(row.date));
  const expenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
  const net = grossRevenue - refunds;
  const revenue = policy === 'nonnegative' ? Math.max(0, net) : net;
  const byMethod = countedPayments.reduce<Record<string, number>>((totals, row) => {
    const method = row.method || 'cash';
    totals[method] = (totals[method] || 0) + row.amount;
    return totals;
  }, {});
  return { countedPayments, grossRevenue, refunds, revenue, expenses, profit: revenue - expenses, byMethod, paymentCount: countedPayments.length, refundCount: refundRows.length, expenseCount: expenseRows.length };
}

export function revenueGrowth(current: number, previous: number): number {
  return previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
}

/** Reference date is explicit: deterministic tests, including year boundaries, without a wall clock. */
export function monthlyFinance(data: FinancialData, referenceDate: string, months = 6) {
  return Array.from({ length: months }, (_, index) => {
    const month = dayjs(referenceDate).subtract(months - 1 - index, 'month');
    const period = month.format('YYYY-MM');
    const summary = financialSummary(data, date => date.startsWith(period), 'nonnegative');
    return { period, revenue: summary.revenue, expense: summary.expenses, profit: summary.profit };
  });
}

export function dashboardFinance(data: FinancialData, referenceDate: string) {
  const summary = financialSummary(data, () => true, 'nonnegative');
  const months = monthlyFinance(data, referenceDate);
  const pending = data.payments.filter(row => !row.deleted && (row.status === 'pending' || row.status === 'late'));
  return {
    totalRevenue: summary.revenue,
    pendingPayments: pending.length,
    pendingAmount: pending.reduce((sum, row) => sum + row.amount, 0),
    growthRate: revenueGrowth(months[months.length - 1].revenue, months[months.length - 2].revenue),
    revenueData: months.map(row => ({ month: dayjs(row.period).format('MMM YYYY'), revenue: row.revenue })),
  };
}
