import { readSnapshot } from '../../data/readers';

export async function loadDailyReportData({ selectedDate }: { selectedDate: string }) {
  const { payments, expenses, refunds, students, courses } = await readSnapshot(['payments', 'expenses', 'refunds', 'students', 'courses']);
  return {
    loadedDate: selectedDate,
    allPayments: payments,
    allExpenses: expenses,
    allRefunds: refunds.sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    students,
    courses,
    payments: payments.filter(payment => payment.date === selectedDate),
    expenses: expenses.filter(expense => expense.date === selectedDate),
  };
}
