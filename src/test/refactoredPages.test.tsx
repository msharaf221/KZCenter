import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../pages/SettingsPage';
import StudentsPage from '../pages/StudentsPage';
import PaymentsPage from '../pages/PaymentsPage';
import { dbAdd, dbClearStore, dbGetAll, dbGetById } from '../data/records';
import { BACKUP_STORES } from '../data/stores';
import type { Course } from '../domain/models';
import { DEFAULT_SETTINGS_VALUES, setSettingsCache } from '../lib/settings';
import { notify } from '../lib/notifications';
import { recordInstallmentPayment } from '../services/paymentService';
import { payrollGroup, payrollInstallment, payrollStudent, payrollTeacher, PAYROLL_NOW } from './helpers/payroll';

const app = {
  settings: { ...DEFAULT_SETTINGS_VALUES, centerName: 'Test Center', receiptPrefix: 'TEST' },
  updateSettings: vi.fn().mockResolvedValue(undefined),
  notificationsEnabled: false,
  enableNotifications: vi.fn(),
  isCloudEnabled: false,
};
const auth = {
  user: { id: 'test-user', username: 'Synthetic User', role: 'admin' },
  can: () => true,
  resetPassword: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../components/layout/Layout', () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('../components/BackupManager', () => ({
  default: () => <section aria-label="Backup manager">Backup manager</section>,
}));
vi.mock('../contexts/AppContext', () => ({ useApp: () => app }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../lib/notifications', async original => ({
  ...(await original<typeof import('../lib/notifications')>()),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
  notifyNewStudent: vi.fn(),
  notifyPaymentReceived: vi.fn(),
  notifyLatePayment: vi.fn(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  setSettingsCache(app.settings);
  for (const store of [...BACKUP_STORES, 'settings'] as const) await dbClearStore(store);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function control(container: HTMLElement, label: string) {
  const field = within(container)
    .getByText(label, { selector: 'label' })
    .parentElement?.querySelector('input,select,textarea');
  expect(field).toBeTruthy();
  return field as HTMLElement;
}

async function seed() {
  await dbAdd('teachers', payrollTeacher());
  const course: Course = {
    id: 'course-1',
    name: 'Synthetic Course',
    category: 'test',
    price: 200,
    durationMonths: 1,
    sessionsPerMonth: 8,
    levels: [],
    color: '#6366f1',
    icon: '📘',
    createdAt: PAYROLL_NOW,
    updatedAt: PAYROLL_NOW,
  };
  await dbAdd('courses', course);
  await dbAdd('groups', payrollGroup());
  await dbAdd('students', payrollStudent({ totalOwed: 200 }));
  await dbAdd('installments', payrollInstallment());
}

describe('decomposed settings sections', () => {
  it('keeps the original sections and saves a shared draft across general/billing/appearance editors', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: 'الإعدادات العامة' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الإيصالات والتنبيهات' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'المظهر' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'فحص سلامة البيانات' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Backup manager' })).toBeInTheDocument();
    await user.clear(screen.getByDisplayValue('Test Center'));
    await user.type(control(document.body, 'اسم المركز'), 'Updated Test Center');
    const prefix = screen.getByPlaceholderText('KZ (افتراضي = السنة)');
    await user.clear(prefix);
    await user.type(prefix, 'new');
    await user.click(screen.getByRole('button', { name: 'حفظ الإعدادات العامة' }));
    expect(app.updateSettings).toHaveBeenCalledOnce();
    expect(app.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ centerName: 'Updated Test Center', receiptPrefix: 'NEW' }),
    );
  });

  it('keeps shared validation and prevents invalid settings writes', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.type(control(document.body, 'البريد الإلكتروني'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'حفظ الإعدادات العامة' }));
    expect(app.updateSettings).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('البريد الإلكتروني غير صحيح');
  });
});

describe('student editor extraction', () => {
  it('creates a student, enrollment, proration-ready installment and initial payment through the original services', async () => {
    await seed();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StudentsPage />
      </MemoryRouter>,
    );
    await screen.findByText('طالب تجريبي أول');
    expect(screen.getByRole('group', { name: 'إجراءات الطلاب' })).toHaveClass('flex-wrap', 'max-w-full');
    await user.click(screen.getByRole('button', { name: /إضافة طالب/ }));
    const dialog = screen.getByRole('dialog', { name: 'إضافة طالب جديد' });
    await user.type(within(dialog).getByPlaceholderText('أدخل اسم الطالب'), 'طالب اختبار إضافي');
    await user.type(within(dialog).getByPlaceholderText('إلزامي'), '01000000000');
    expect(within(dialog).getByText(/فيه طالب بنفس رقم ولي الأمر/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /مجموعة رياضيات تجريبية/ }));
    await user.click(within(dialog).getByRole('button', { name: 'المبلغ كله' }));
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const students = await dbGetAll('students');
    const created = students.find(s => s.name === 'طالب اختبار إضافي');
    expect(created?.enrolledGroups).toEqual(['group-1']);
    expect((await dbGetAll('enrollments')).filter(e => e.studentId === created?.id)).toHaveLength(1);
    expect((await dbGetAll('installments')).filter(i => i.studentId === created?.id)[0].amount).toBe(200);
    expect((await dbGetAll('payments')).filter(p => p.studentId === created?.id)[0]).toMatchObject({
      amount: 200,
      status: 'paid',
    });
  });
});

describe('payment form and reversal dialogs', () => {
  it('retains balance preview, receipt numbering and installment allocation when recording a payment', async () => {
    await seed();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /إضافة دفعة/ }));
    const dialog = screen.getByRole('dialog', { name: 'إضافة دفعة جديدة' });
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /طالب تجريبي أول/ })).toBeInTheDocument());
    await user.selectOptions(control(dialog, 'الطالب *'), 'student-1');
    await within(dialog).findByText('المطلوب');
    expect(await within(dialog).findByText(/TEST-\d{4}-0000/)).toBeInTheDocument();
    const amount = control(dialog, 'المبلغ *');
    await user.clear(amount);
    await user.type(amount, '50');
    await user.click(within(dialog).getByRole('button', { name: 'إضافة' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const payments = await dbGetAll('payments');
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 50, studentId: 'student-1', status: 'paid', collectedBy: 'test-user' });
    expect(payments[0].receiptNo).toMatch(/^TEST-\d{4}-0001$/);
    expect((await dbGetById('installments', 'installment-1'))?.paidAmount).toBe(50);
  });

  it('preserves refund metadata and balances after the refund dialog is extracted', async () => {
    await seed();
    const payment = (await recordInstallmentPayment({ studentId: 'student-1', amount: 100 })).payment!;
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'استرداد مبلغ' }));
    const dialog = screen.getByRole('dialog', { name: 'استرداد مبلغ' });
    const amount = control(dialog, 'المبلغ المسترد *');
    await user.clear(amount);
    await user.type(amount, '25');
    await user.type(control(dialog, 'سبب الاسترداد *'), 'استرداد اختبار');
    await user.click(within(dialog).getByRole('button', { name: 'تأكيد الاسترداد' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await dbGetAll('refunds'))[0]).toMatchObject({
      amount: 25,
      paymentId: payment.id,
      studentId: 'student-1',
      reason: 'استرداد اختبار',
    });
    expect((await dbGetById('students', 'student-1'))?.totalPaid).toBe(75);
  });

  it('keeps voiding auditable without deleting the payment or its receipt', async () => {
    await seed();
    const payment = (await recordInstallmentPayment({ studentId: 'student-1', amount: 100 })).payment!;
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'إلغاء الدفعة' }));
    const dialog = screen.getByRole('dialog', { name: 'إلغاء الدفعة' });
    await user.type(control(dialog, 'سبب الإلغاء *'), 'إلغاء اختبار');
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء الدفعة' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await dbGetById('payments', payment.id)).toMatchObject({ voided: true, receiptNo: payment.receiptNo });
    expect((await dbGetById('students', 'student-1'))?.totalPaid).toBe(0);
    expect((await dbGetById('installments', 'installment-1'))?.paidAmount).toBe(0);
  });
});
