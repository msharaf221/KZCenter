import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import ReportsPage from '../pages/ReportsPage';
import { dbAdd, dbClearStore, type Expense, type Payment } from '../lib/db';
import * as payroll from '../services/payroll/profitability';
import { formatCurrency } from '../lib/utils';
import { payrollGroup, payrollStudent, payrollTeacher } from './helpers/payroll';

vi.mock('../components/layout/Layout', () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}));
vi.mock('../contexts/AppContext', () => ({
  useApp: () => ({ settings: { currency: 'EGP', primaryColor: '#6366f1' } }),
}));
// هذه الاختبارات تخص أقسام الصفحة والحسابات، لا قياسات الرسوم داخل jsdom.
vi.mock('recharts', async importOriginal => ({
  ...await importOriginal<typeof import('recharts')>(),
  ResponsiveContainer: () => null,
}));

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(payroll, 'calcGroupProfitability').mockResolvedValue([]);
  for (const store of ['students', 'teachers', 'groups', 'courses', 'payments', 'refunds', 'expenses', 'installments'] as const) {
    await dbClearStore(store);
  }
  const now = new Date().toISOString();
  const today = dayjs().format('YYYY-MM-DD');
  await dbAdd('students', payrollStudent());
  await dbAdd('teachers', payrollTeacher());
  await dbAdd('groups', payrollGroup());
  const payment: Payment = {
    id: 'current-payment', studentId: 'student-1', groupId: 'group-1', type: 'subscription',
    status: 'paid', amount: 200, date: today, createdAt: now, updatedAt: now,
  };
  await dbAdd('payments', payment);
  await dbAdd('payments', {
    ...payment, id: 'previous-payment', amount: 300,
    date: dayjs().subtract(2, 'month').format('YYYY-MM-DD'),
  });
  await dbAdd<Expense>('expenses', {
    id: 'salary-expense', category: 'salaries', amount: 50, description: 'صرف مرتب تجريبي',
    date: today, createdAt: now, updatedAt: now,
  });
});

describe('التقارير بدون قسم ربحية المجموعات', () => {
  it('يحذف القسم وحساباته الخلفية مع الإبقاء على باقي التقارير والأرقام المالية', async () => {
    render(<ReportsPage />);
    expect(await screen.findByText(formatCurrency(450))).toBeInTheDocument();
    expect(screen.queryByText(/ربحية المجموعات|جاري حساب الربحية|محسوب لها ربحية/)).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'تكلفة المدرس' })).not.toBeInTheDocument();
    expect(payroll.calcGroupProfitability).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'الإيرادات والمصروفات (آخر 6 أشهر)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'نسبة امتلاء المجموعات' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'أداء المدرسين' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تصدير CSV' })).toBeInTheDocument();
  });

  it('تغيير الفترة والطباعة لا يعيدان القسم ولا يشغّلان حساب ربحيته', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ReportsPage />);
    await screen.findByText(formatCurrency(450));
    await user.click(screen.getByRole('button', { name: 'هذا الشهر' }));
    expect(screen.getByText(formatCurrency(150))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'طباعة' }));
    expect(print).toHaveBeenCalledOnce();
    expect(screen.queryByText('ربحية المجموعات')).not.toBeInTheDocument();
    expect(payroll.calcGroupProfitability).not.toHaveBeenCalled();
  });
});
