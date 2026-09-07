/**
 * اختبارات نافذة «تصفير المديونيات» (الواجهة):
 * الملخص بيتحسب من القاعدة، وزرار التأكيد متعطل لحد كتابة السبب وكلمة «تصفير».
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import WriteOffDebtsDialog from '../components/WriteOffDebtsDialog';
import {
  dbAdd, dbGetById, dbClearStore, generateId,
  Student, Group, Course, Installment, Enrollment,
} from '../lib/db';

const NOW = '2026-03-10T10:00:00.000Z';
const PAST = dayjs().subtract(10, 'day').format('YYYY-MM-DD');
const FUTURE = dayjs().add(20, 'day').format('YYYY-MM-DD');

async function seedDebts() {
  const courseId = generateId();
  const groupId = generateId();
  const studentId = generateId();

  await dbAdd<Course>('courses', {
    id: courseId, name: 'رياضيات', category: 'علوم', price: 500, durationMonths: 1,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId, name: 'مجموعة أ', courseId, teacherId: 't1', schedule: [],
    maxStudents: 20, status: 'open', studentIds: [studentId], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Student>('students', {
    id: studentId, name: 'أحمد محمد', age: 12, gender: 'male', parentPhone: '01000000000',
    status: 'active', totalPaid: 0, enrolledGroups: [groupId], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Enrollment>('enrollments', {
    id: generateId(), studentId, groupId, status: 'active',
    enrolledAt: NOW, initialPayment: 0, createdAt: NOW, updatedAt: NOW,
  });

  const overdueId = generateId();
  await dbAdd<Installment>('installments', {
    id: overdueId, studentId, groupId, periodIndex: 1, periodLabel: 'شهر 1',
    amount: 500, paidAmount: 0, dueDate: PAST, status: 'pending', createdAt: NOW, updatedAt: NOW,
  });
  const upcomingId = generateId();
  await dbAdd<Installment>('installments', {
    id: upcomingId, studentId, groupId, periodIndex: 2, periodLabel: 'شهر 2',
    amount: 500, paidAmount: 0, dueDate: FUTURE, status: 'pending', createdAt: NOW, updatedAt: NOW,
  });

  return { overdueId, upcomingId };
}

/** الأرقام بترسم بأرقام عربية (ar-EG) — بنوحّدها ASCII عشان المقارنة */
function digits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\D/g, '');
}

const amountText = () => digits(screen.getByTestId('writeoff-amount').textContent || '');

beforeEach(async () => {
  for (const store of ['students', 'groups', 'courses', 'payments', 'enrollments', 'installments'] as const) {
    await dbClearStore(store);
  }
});

describe('نافذة تصفير المديونيات', () => {
  it('بتعرض ملخص بالأرقام من قاعدة البيانات (النطاق الافتراضي: المستحق والمتأخر)', async () => {
    await seedDebts();
    render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={() => {}} currency="جنيه" />);

    // النطاق الافتراضي due → القسط المتأخر بس
    await waitFor(() => expect(screen.getByTestId('writeoff-installments')).toHaveTextContent('1'));
    expect(screen.getByTestId('writeoff-students')).toHaveTextContent('1');
    expect(amountText()).toContain('500');
    expect(screen.getByTestId('writeoff-overdue').textContent).toBeTruthy();
    expect(screen.getByText('المستحق والمتأخر فقط')).toBeInTheDocument();
  });

  it('تغيير النطاق لكل المتبقي بيحدّث الملخص', async () => {
    await seedDebts();
    const user = userEvent.setup();
    render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={() => {}} currency="جنيه" />);

    await waitFor(() => expect(amountText()).toContain('500'));
    await user.click(screen.getByText('كل المتبقي'));

    await waitFor(() => expect(screen.getByTestId('writeoff-installments')).toHaveTextContent('2'));
    expect(amountText()).toContain('1000');
  });

  it('التأكيد متعطل من غير سبب ومن غير كلمة «تصفير»', async () => {
    await seedDebts();
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={onDone} currency="جنيه" />);

    const confirmBtn = await screen.findByRole('button', { name: 'تأكيد التصفير' });
    expect(confirmBtn).toBeDisabled();

    // السبب لوحده مش كافي
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], 'إبراء ذمة شهر أغسطس');
    expect(confirmBtn).toBeDisabled();

    // كلمة تانية مش كافية
    await user.type(inputs[1], 'تصفير المديونيات');
    expect(confirmBtn).toBeDisabled();

    // الكلمة المظبوطة بتفعّل الزرار
    await user.clear(inputs[1]);
    await user.type(inputs[1], 'تصفير');
    await waitFor(() => expect(confirmBtn).toBeEnabled());
  });

  it('التنفيذ بيلغي الأقساط وبيبلّغ الصفحة بالنتيجة', async () => {
    const { overdueId, upcomingId } = await seedDebts();
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={onDone} currency="جنيه" />);

    const inputs = await screen.findAllByRole('textbox');
    await user.type(inputs[0], 'إبراء ذمة قبل التجديدات');
    await user.type(inputs[1], 'تصفير');

    const confirmBtn = screen.getByRole('button', { name: 'تأكيد التصفير' });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    await user.click(confirmBtn);

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const info = onDone.mock.calls[0][0];
    expect(info.scope).toBe('due');
    expect(info.reason).toBe('إبراء ذمة قبل التجديدات');
    expect(info.result.success).toBe(true);
    expect(info.result.preview?.installmentsCount).toBe(1);

    // القسط المتأخر اتلغي والجاي سليم
    expect((await dbGetById<Installment>('installments', overdueId))?.status).toBe('cancelled');
    expect((await dbGetById<Installment>('installments', upcomingId))?.status).not.toBe('cancelled');
  });

  it('لو مفيش مديونيات: الملخص بيوضّح كده والتأكيد متعطل', async () => {
    render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={() => {}} currency="جنيه" />);

    await waitFor(() =>
      expect(screen.getByText(/لا توجد مديونيات مطابقة لهذا النطاق/)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'تأكيد التصفير' })).toBeDisabled();
  });

  it('بعد التنفيذ النافذة بتحدّث الملخص والتأكيد يتعطّل تاني', async () => {
    await seedDebts();
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={onDone} currency="جنيه" />);

    const inputs = await screen.findAllByRole('textbox');
    await user.type(inputs[0], 'إبراء ذمة');
    await user.type(inputs[1], 'تصفير');
    // نطاق «كل المتبقي» عشان ننفّذ مرتين: التانية تفشل
    await user.click(screen.getByText('كل المتبقي'));

    const confirmBtn = screen.getByRole('button', { name: 'تأكيد التصفير' });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    await user.click(confirmBtn);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    // بعد التنفيذ الناجح النافذة لسه مفتوحة (الصفحة هي اللي بتقفلها) — الملخص يتحدّث بصفر
    await waitFor(() => expect(screen.getByText(/لا توجد مديونيات مطابقة لهذا النطاق/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'تأكيد التصفير' })).toBeDisabled();
  });
});
