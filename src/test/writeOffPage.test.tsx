/**
 * اختبار صفحة المديونيات من الواجهة للقاعدة:
 * زرار «تصفير المديونيات» → نافذة التأكيد → التنفيذ → سجل المراجعة + تحديث القايمة.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import DebtorsPage from '../pages/DebtorsPage';
import { AppProvider } from '../contexts/AppContext';
import { AuthProvider } from '../contexts/AuthContext';
import {
  dbAdd, dbClearStore, generateId,
  Student, Group, Course, Installment, Enrollment,
} from '../lib/db';
import { getAuditEntries } from '../lib/audit';

const NOW = '2026-03-10T10:00:00.000Z';
const PAST = dayjs().subtract(10, 'day').format('YYYY-MM-DD');

async function seedDebtor(name = 'أحمد محمد') {
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
    id: studentId, name, age: 12, gender: 'male', parentPhone: '01000000000',
    status: 'active', totalPaid: 0, enrolledGroups: [groupId], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Enrollment>('enrollments', {
    id: generateId(), studentId, groupId, status: 'active',
    enrolledAt: NOW, initialPayment: 0, createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Installment>('installments', {
    id: generateId(), studentId, groupId, periodIndex: 1, periodLabel: 'شهر 1',
    amount: 500, paidAmount: 0, dueDate: PAST, status: 'pending', createdAt: NOW, updatedAt: NOW,
  });

  return { studentId, groupId };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppProvider>
          <DebtorsPage />
        </AppProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  for (const store of [
    'students', 'groups', 'courses', 'payments', 'enrollments', 'installments', 'audit_logs',
  ] as const) {
    await dbClearStore(store);
  }
});

describe('زرار تصفير المديونيات في صفحة المديونيات', () => {
  it('بيفتح النافذة وينفّذ التصفير ويسجّله في سجل المراجعة', async () => {
    await seedDebtor();
    const user = userEvent.setup();
    renderPage();

    // الطالب ظاهر في جدول المديونيات
    await waitFor(() => expect(screen.getByText('أحمد محمد')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /تصفير المديونيات/ }));
    await waitFor(() => expect(screen.getByText(/عملية غير قابلة للتراجع/)).toBeInTheDocument());

    const inputs = screen.getAllByRole('textbox').filter(i => (i as HTMLInputElement).type === 'text');
    const reasonInput = inputs[inputs.length - 2];
    const wordInput = inputs[inputs.length - 1];
    await user.type(reasonInput, 'إبراء ذمة قبل تجديدات سبتمبر');
    await user.type(wordInput, 'تصفير');

    const confirmBtn = screen.getByRole('button', { name: 'تأكيد التصفير' });
    await waitFor(() => expect(confirmBtn).toBeEnabled());
    await user.click(confirmBtn);

    // سجل المراجعة: حدث writeoff واحد بالتفاصيل
    await waitFor(async () => {
      const rows = await getAuditEntries();
      const writeOffs = rows.filter(r => r.action === 'writeoff');
      expect(writeOffs).toHaveLength(1);
      expect(writeOffs[0].entity).toBe('installments');
      expect(writeOffs[0].details).toContain('إبراء ذمة قبل تجديدات سبتمبر');
    });

    // والقايمة اتحدّثت: مفيش مديونيات
    await waitFor(() => expect(screen.getByText(/لا توجد مديونيات/)).toBeInTheDocument());
  });
});
