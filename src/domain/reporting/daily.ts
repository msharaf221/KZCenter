import dayjs from 'dayjs';
import { financialSummary, revenueGrowth, type FinancialData } from './finance';

export function dailyReport(data: FinancialData, selectedDate: string) {
  const day = financialSummary(data, date => date === selectedDate, 'nonnegative');
  const payments = data.payments.filter(row => !row.deleted && row.date === selectedDate);
  const pending = payments.filter(row => row.status === 'pending');
  const late = payments.filter(row => row.status === 'late');
  const todayPending = pending.reduce((sum, row) => sum + row.amount, 0);
  const todayLate = late.reduce((sum, row) => sum + row.amount, 0);
  const yesterday = dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD');
  const yesterdayRevenue = financialSummary(data, date => date === yesterday, 'nonnegative').revenue;
  return {
    todayRevenue: day.revenue,
    todayExpenses: day.expenses,
    todayProfit: day.profit,
    todayPending,
    todayLate,
    totalPaymentsCount: payments.length,
    paidPaymentsCount: day.countedPayments.length,
    revenueChange: Math.round(revenueGrowth(day.revenue, yesterdayRevenue)),
    statusData: [
      { name: 'مدفوع', value: day.countedPayments.length, amount: day.revenue },
      { name: 'معلق', value: pending.length, amount: todayPending },
      { name: 'متأخر', value: late.length, amount: todayLate },
    ].filter(row => row.value > 0),
    // Type charts deliberately show gross collections, not an allocated share of refunds.
    typeData: ([['subscription', 'اشتراكات'], ['books', 'كتب'], ['other', 'أخرى']] as const).map(([type, name]) => ({
      name, value: day.countedPayments.filter(row => row.type === type).reduce((sum, row) => sum + row.amount, 0),
    })).filter(row => row.value > 0),
    last7Days: Array.from({ length: 7 }, (_, index) => {
      const date = dayjs(selectedDate).subtract(6 - index, 'day');
      const summary = financialSummary(data, value => value === date.format('YYYY-MM-DD'), 'nonnegative');
      return { date: date.format('MM/DD'), day: date.format('ddd'), revenue: summary.revenue, expense: summary.expenses, profit: summary.profit };
    }),
  };
}
