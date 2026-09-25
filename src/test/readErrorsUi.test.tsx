import 'fake-indexeddb/auto';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import * as database from '../data/database';
import { dbPut } from '../data/records';
import { DEFAULT_SETTINGS_VALUES, setSettingsCache } from '../lib/settings';
import StudentsPage from '../pages/StudentsPage';
import TeachersPage from '../pages/TeachersPage';
import CoursesPage from '../pages/CoursesPage';
import GroupsPage from '../pages/GroupsPage';
import PaymentsPage from '../pages/PaymentsPage';
import ExpensesPage from '../pages/ExpensesPage';
import ReportsPage from '../pages/ReportsPage';
import DailyReportsPage from '../pages/DailyReportsPage';
import DebtorsPage from '../pages/DebtorsPage';
import InventoryPage from '../pages/InventoryPage';
import ExamsPage from '../pages/ExamsPage';
import AttendancePage from '../pages/AttendancePage';
import TeacherProfilePage from '../pages/TeacherProfilePage';
import StudentProfilePage from '../pages/StudentProfilePage';
import * as attendanceQueries from '../services/queries/attendance';
import { payrollGroup, payrollInstallment, payrollStudent, payrollTeacher } from './helpers/payroll';

vi.mock('../components/layout/Layout', () => ({ default: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main> }));
vi.mock('../contexts/AppContext', () => ({ useApp: () => ({ settings: DEFAULT_SETTINGS_VALUES }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-admin', username: 'synthetic', role: 'admin' }, can: () => true }) }));
vi.mock('../lib/notifications', async original => ({ ...(await original<typeof import('../lib/notifications')>()), notify: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('recharts', async original => ({ ...(await original<typeof import('recharts')>()), ResponsiveContainer: () => null }));

beforeEach(async () => {
  const db = await database.getDB();
  for (const store of db.objectStoreNames) await db.clear(store);
  setSettingsCache(DEFAULT_SETTINGS_VALUES);
});
afterEach(() => { vi.restoreAllMocks(); setSettingsCache(null); });
const failure = new Error('Synthetic private database details must not appear in the UI');

describe('visible page read failures and retry', () => {
  it.each([
    ['students', StudentsPage], ['teachers', TeachersPage], ['courses', CoursesPage], ['groups', GroupsPage],
    ['payments', PaymentsPage], ['expenses', ExpensesPage], ['reports', ReportsPage], ['daily reports', DailyReportsPage],
    ['debtors', DebtorsPage], ['inventory', InventoryPage], ['exams', ExamsPage], ['attendance', AttendancePage],
  ])('shows an actionable error, not an empty successful %s page', async (_name, Page) => {
    const read = vi.spyOn(database, 'getDB').mockRejectedValue(failure);
    const user = userEvent.setup();
    render(<MemoryRouter><Page /></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
    expect(screen.queryByText(failure.message)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تصدير CSV/ })).not.toBeInTheDocument();
    read.mockRestore();
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText('ربحية المجموعات')).not.toBeInTheDocument();
  });
  it.each([
    ['student', '/students/student-1', '/students/:id', StudentProfilePage],
    ['teacher', '/teachers/teacher-1', '/teachers/:id', TeacherProfilePage],
  ])('does not strand the %s profile in its requested-ID loading guard after failure', async (_kind, entry, path, Page) => {
    await dbPut('students', payrollStudent());
    await dbPut('teachers', payrollTeacher());
    const read = vi.spyOn(database, 'getDB').mockRejectedValue(failure);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[entry]}><Routes><Route path={path} element={<Page />} /></Routes></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.queryByText('جاري التحميل...')).not.toBeInTheDocument();
    read.mockRestore();
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /^ملف .*:/ })).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('disables attendance printing/editing after a roster failure and retries the selected register', async () => {
    await dbPut('groups', payrollGroup());
    const register = vi.spyOn(attendanceQueries, 'loadAttendanceRegister').mockRejectedValue(failure);
    const user = userEvent.setup();
    render(<MemoryRouter><AttendancePage /></MemoryRouter>);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeDisabled();
    register.mockRestore();
    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeEnabled();
  });
});


it('hides the previous daily financial report when a date refresh fails, and retries the new date', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><DailyReportsPage /></MemoryRouter>);
  await screen.findByText('إجمالي الإيرادات');
  const read = vi.spyOn(database, 'getDB').mockRejectedValue(failure);
  const input = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '2026-08-15' } });
  await screen.findByRole('alert');
  expect(screen.queryByText('إجمالي الإيرادات')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'تصدير CSV' })).not.toBeInTheDocument();
  read.mockRestore();
  await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
  await screen.findByText('إجمالي الإيرادات');
  expect(document.querySelector('input[type="date"]')).toHaveValue('2026-08-15');
});


it('keeps group search/filter/actions wrapped within narrow viewports', async () => {
  render(<MemoryRouter><GroupsPage /></MemoryRouter>);
  const actions = screen.getByRole('group', { name: 'إجراءات المجموعات' });
  expect(actions).toHaveClass('flex-wrap', 'max-w-full');
  expect(screen.getByPlaceholderText('بحث بالاسم...').parentElement).toHaveClass('min-w-0', 'basis-full');
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});


it('binds the student profile and its collection draft to the current route identity', async () => {
  await dbPut('students', payrollStudent());
  await dbPut('students', payrollStudent({ id: 'student-2', name: 'Second synthetic student' }));
  await dbPut('groups', payrollGroup());
  await dbPut('installments', payrollInstallment());
  render(<MemoryRouter initialEntries={['/students/student-1']}>
    <Link to="/students/student-2">Change student route</Link>
    <Routes><Route path="/students/:id" element={<StudentProfilePage />} /></Routes>
  </MemoryRouter>);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'تحصيل' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('link', { name: 'Change student route' }));
  await screen.findByRole('heading', { name: 'ملف الطالب: Second synthetic student' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});


it('preserves off-page selections when toggling the currently filtered student list', async () => {
  await dbPut('students', payrollStudent({ id: 'selected-a', name: 'Alpha synthetic' }));
  await dbPut('students', payrollStudent({ id: 'selected-b', name: 'Beta synthetic' }));
  render(<MemoryRouter><StudentsPage /></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'اختيار Alpha synthetic' }));
  const search = screen.getByPlaceholderText(/بحث بالاسم/);
  await user.type(search, 'Beta');
  await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'اختيار Alpha synthetic' })).not.toBeInTheDocument());
  await user.click(screen.getByRole('checkbox', { name: 'اختيار كل الطلاب المعروضين' }));
  await user.clear(search);
  await screen.findByRole('checkbox', { name: 'اختيار Alpha synthetic' });
  expect(screen.getByRole('checkbox', { name: 'اختيار Alpha synthetic' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'اختيار Beta synthetic' })).toBeChecked();
});
