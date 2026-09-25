import { seedSession as loginAs } from './helpers/session';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import PayrollPage from '../pages/PayrollPage';
import TeachersPage from '../pages/TeachersPage';
import { AuthProvider } from '../contexts/AuthContext';
import { AppProvider } from '../contexts/AppContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { dbAdd, dbClearStore, dbGetAll, dbGetById, dbSoftDelete, type Expense, type PayrollRecord, type Teacher, type UserRole } from '../lib/db';
import { calcTeacherPayroll, loadPayrollContext, savePayrollRecord } from '../lib/payroll';
import { getAuditEntries } from '../lib/audit';
import { formatCurrency } from '../lib/utils';
import * as printing from '../lib/printing';
import { seedPayroll, payrollInstallment, payrollTeacher, payrollGroup } from './helpers/payroll';

const period = dayjs().format('YYYY-MM');
const teacherName = payrollTeacher().name;

function renderPage(page: 'payroll' | 'teachers' = 'payroll') {
  return render(<MemoryRouter>
    <AuthProvider><AppProvider><ProtectedRoute entity={page}>
      {page === 'payroll' ? <PayrollPage /> : <TeachersPage />}
    </ProtectedRoute></AppProvider></AuthProvider>
  </MemoryRouter>);
}

async function ready() {
  return screen.findByRole('button', { name: `تفاصيل مستحقات ${teacherName}` });
}

function teacherRow() {
  return screen.getByRole('row', { name: new RegExp(teacherName) });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  for (const store of ['teachers', 'students', 'groups', 'courses', 'enrollments', 'installments', 'payments', 'attendance', 'teacher_advances', 'expenses', 'payroll', 'audit_logs', 'users'] as const) {
    await dbClearStore(store);
  }
  await loginAs('admin');
});

describe('قسم مرتبات المدرسين من الواجهة لقاعدة البيانات', () => {
  it('يظهر في القائمة ويحسب كامل الاشتراك غير المسدد مع كشف نصيب الطالب وطباعته', async () => {
    await seedPayroll(period);
    const print = vi.spyOn(printing, 'printTable').mockImplementation(() => {});
    const user = userEvent.setup();
    renderPage();
    await ready();
    expect(screen.getByRole('link', { name: 'مرتبات المدرسين' })).toBeInTheDocument();
    expect(within(teacherRow()).getAllByText(formatCurrency(120))).toHaveLength(2);
    await user.click(await ready());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('طالب تجريبي أول')).toBeInTheDocument();
    expect(within(dialog).getByText('60%')).toBeInTheDocument();
    expect(within(dialog).getByText(/سداد الطالب أو تأخره لا يغيّر/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'طباعة الكشف' }));
    expect(print).toHaveBeenCalledWith(expect.objectContaining({
      rows: [expect.objectContaining({ studentName: 'طالب تجريبي أول', subscriptionAmount: 200, amount: 120, rate: 60 })],
    }));
  });

  it('المحاسب يغير نسبة المدرس وحده دون الحاجة لتعديل بياناته الأكاديمية', async () => {
    const teacher = await seedPayroll(period);
    await dbAdd('teachers', payrollTeacher({ id: 'teacher-2', name: 'مدرس آخر', payRate: 25 }));
    await dbAdd('groups', payrollGroup({ id: 'group-2', teacherId: 'teacher-2' }));
    await dbAdd('installments', payrollInstallment({ id: 'installment-2', groupId: 'group-2', dueDate: `${period}-01` }));
    await loginAs('accountant');
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.click(screen.getByRole('button', { name: `إعدادات مستحقات ${teacherName}` }));
    const dialog = screen.getByRole('dialog');
    const rate = within(dialog).getByLabelText('نسبة المدرس (%)');
    await user.clear(rate);
    await user.type(rate, '40');
    await user.click(within(dialog).getByRole('button', { name: 'حفظ إعدادات المستحقات' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await dbGetById<Teacher>('teachers', teacher.id))?.payRate).toBe(40);
    expect((await dbGetById<Teacher>('teachers', 'teacher-2'))?.payRate).toBe(25);
    expect(within(teacherRow()).getAllByText(formatCurrency(80)).length).toBeGreaterThan(0);
    await waitFor(async () => expect((await getAuditEntries()).some(e => e.action === 'update' && e.entityId === teacher.id)).toBe(true));
  });

  it('يرفض إدخال نسبة تتجاوز 100 في الواجهة', async () => {
    const teacher = await seedPayroll(period);
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.click(screen.getByRole('button', { name: `إعدادات مستحقات ${teacherName}` }));
    const rate = screen.getByLabelText('نسبة المدرس (%)');
    await user.clear(rate);
    await user.type(rate, '101');
    await user.click(screen.getByRole('button', { name: 'حفظ إعدادات المستحقات' }));
    expect(rate).toBeInvalid();
    expect((await dbGetById<Teacher>('teachers', teacher.id))?.payRate).toBe(60);
  });

  it('يعتمد الشهر ثم يصرفه جزئياً وكاملاً دون تكرار المصروف أو الاعتماد', async () => {
    await seedPayroll(period);
    const user = userEvent.setup();
    renderPage();
    await user.click(await ready());
    const deductions = screen.getByLabelText('خصومات إضافية');
    await user.clear(deductions);
    await user.type(deductions, '20');
    await user.type(screen.getByLabelText('ملاحظات الكشف / سبب الخصم'), 'خصم تجريبي');
    await user.dblClick(screen.getByRole('button', { name: 'اعتماد كشف الشهر' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const records = await dbGetAll<PayrollRecord>('payroll');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ gross: 120, deductions: 20, net: 100, rate: 60, status: 'pending' });
    expect(await dbGetAll('expenses')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: `صرف مستحقات ${teacherName}` }));
    await user.clear(screen.getByLabelText('مبلغ الصرف'));
    await user.type(screen.getByLabelText('مبلغ الصرف'), '40');
    await user.dblClick(screen.getByRole('button', { name: 'تأكيد الصرف' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(teacherRow()).getByText('صرف جزئي')).toBeInTheDocument();
    expect(await dbGetAll('expenses')).toHaveLength(1);
    expect((await dbGetById<PayrollRecord>('payroll', records[0].id))?.paidAmount).toBe(40);

    await user.click(screen.getByRole('button', { name: `صرف مستحقات ${teacherName}` }));
    expect(screen.getByLabelText('مبلغ الصرف')).toHaveValue(60);
    await user.click(screen.getByRole('button', { name: 'تأكيد الصرف' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(teacherRow()).getByText('مكتمل')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `صرف مستحقات ${teacherName}` })).not.toBeInTheDocument();
    const expenses = await dbGetAll<Expense>('expenses');
    expect(expenses).toHaveLength(2);
    expect(expenses.reduce((sum, e) => sum + e.amount, 0)).toBe(100);
    await user.click(await ready());
    expect(screen.queryByRole('button', { name: 'اعتماد كشف الشهر' })).not.toBeInTheDocument();
    expect(screen.getByText(/كشف معتمد في/)).toBeInTheDocument();
    expect(screen.getByText(/سجل الصرف — الإجمالي/)).toBeInTheDocument();
    await waitFor(async () => expect((await getAuditEntries()).filter(e => e.action === 'payroll')).toHaveLength(3));
  });

  it('اختيار الشهر يغير الحساب ولا ينقل اشتراكاً من شهر آخر', async () => {
    await seedPayroll(period);
    const user = userEvent.setup();
    renderPage();
    await ready();
    const next = dayjs(`${period}-01`).add(1, 'month').format('YYYY-MM');
    fireEvent.change(screen.getByLabelText('شهر المرتبات'), { target: { value: next } });
    await ready();
    await user.click(await ready());
    expect(screen.getByText(/لا توجد اشتراكات مسجلة لهذا الشهر/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'اعتماد كشف الشهر' })).toBeDisabled();
  });

  it('البحث يعمل ويعرض حالة عدم وجود نتائج بدلاً من أرقام مدرس آخر', async () => {
    await seedPayroll(period);
    const user = userEvent.setup();
    renderPage();
    await ready();
    await user.type(screen.getByLabelText('البحث عن مدرس'), 'اسم غير موجود');
    expect(screen.getByText('لا توجد نتائج مطابقة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `تفاصيل مستحقات ${teacherName}` })).not.toBeInTheDocument();
  });

  it('يبقى الكشف المعتمد قابلاً للعرض بعد حذف المدرس', async () => {
    const teacher = await seedPayroll(period);
    const context = await loadPayrollContext(period);
    await savePayrollRecord({ teacherId: teacher.id, period, calc: calcTeacherPayroll(teacher, period, context) });
    await dbSoftDelete('teachers', teacher.id);
    renderPage();
    await ready();
    expect(within(teacherRow()).getByText('لم يُصرف')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `إعدادات مستحقات ${teacherName}` })).not.toBeInTheDocument();
  });

  it('يعرض توجيهاً واضحاً إذا لم يُضف أي مدرس', async () => {
    renderPage();
    expect(await screen.findByText('لا يوجد مدرسون لحساب المرتبات')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'إضافة مدرس' })).toBeInTheDocument();
  });
});

describe('صلاحيات المرتبات وحفظ النسبة من بيانات المدرس', () => {
  it.each(['secretary', 'supervisor', 'teacher'] as UserRole[])('%s لا يستطيع فتح المرتبات مباشرة', async role => {
    await seedPayroll(period);
    await loginAs(role);
    renderPage();
    expect(await screen.findByText('غير مصرح بالوصول')).toBeInTheDocument();
    expect(screen.queryByText(teacherName)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'مرتبات المدرسين' })).not.toBeInTheDocument();
  });

  it('تعديل بيانات المدرس لا يفقد موديل النسبة أو قيمتها', async () => {
    const teacher = await seedPayroll(period);
    const user = userEvent.setup();
    renderPage('teachers');
    await user.click(await screen.findByRole('button', { name: 'تعديل' }));
    expect(screen.getByLabelText('طريقة حساب المستحقات')).toHaveValue('subscription_percentage');
    expect(screen.getByLabelText('نسبة المدرس (%)')).toHaveValue(60);
    await user.click(screen.getByRole('button', { name: 'تحديث' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await dbGetById('teachers', teacher.id)).toMatchObject({ payModel: 'subscription_percentage', payRate: 60 });
  });
});
