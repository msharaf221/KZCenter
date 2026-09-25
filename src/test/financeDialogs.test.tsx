import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as database from '../data/database';
import { dbPut } from '../data/records';
import { readAll } from '../data/readers';
import { enrollStudent } from '../services/enrollmentService';
import * as debtService from '../services/debtWriteOffService';
import * as queries from '../services/queries/enrollmentDialogs';
import * as commands from '../services/commands/studentFinance';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';
import { formatCurrency } from '../lib/utils';
import RenewDialog from '../components/RenewDialog';
import TransferDialog from '../components/TransferDialog';
import WriteOffDebtsDialog from '../components/WriteOffDebtsDialog';
import QuickCollectDialog from '../features/payments/QuickCollectDialog';
import { payrollStudent, payrollGroup, PAYROLL_NOW } from './helpers/payroll';

vi.mock('../contexts/AppContext', () => ({ useApp: () => ({ settings: DEFAULT_SETTINGS_VALUES }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-admin', username: 'Synthetic', role: 'admin' } }) }));
vi.mock('../lib/audit', () => ({ addAuditEntry: vi.fn() }));
vi.mock('../lib/notifications', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
const studentId = 'student-1', groupId = 'group-1';
const props = { open: true, studentId, studentName: 'Synthetic student', groupId, onClose: vi.fn(), onDone: vi.fn() };
const course = { id: 'course-1', name: 'Synthetic Course', price: 200, durationMonths: 1, category: 'test', color: '#000000', icon: 'x', levels: [], createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
beforeEach(async () => {
  vi.clearAllMocks();
  const db = await database.getDB(); for (const name of db.objectStoreNames) await db.clear(name);
  await dbPut('students', payrollStudent({ enrolledGroups: [] }));
  await dbPut('groups', payrollGroup({ studentIds: [] }));
  await dbPut('courses', course);
  await enrollStudent(studentId, groupId, 20, { priceOverride: 100, discountPercent: 10 });
});
afterEach(() => vi.restoreAllMocks());

it('never offers renewal after a failed initial read, and recovers via explicit retry', async () => {
  const read = vi.spyOn(queries, 'loadRenewalDialog').mockRejectedValue(new Error('Synthetic load failure'));
  render(<RenewDialog {...props} />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'تجديد' })).not.toBeInTheDocument();
  read.mockRestore();
  await userEvent.setup().click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
  expect(await screen.findByRole('button', { name: 'تجديد' })).toBeEnabled();
});
it('starts one renewal for repeated clicks and resets the draft on close/reopen', async () => {
  const wait = deferred<Awaited<ReturnType<typeof commands.renewStudentSubscription>>>();
  const save = vi.spyOn(commands, 'renewStudentSubscription').mockReturnValue(wait.promise);
  const view = render(<RenewDialog {...props} />);
  const button = await screen.findByRole('button', { name: 'تجديد' });
  const month = document.querySelector('select') as HTMLSelectElement;
  fireEvent.change(month, { target: { value: '3' } });
  fireEvent.click(button); fireEvent.click(button);
  expect(save).toHaveBeenCalledOnce();
  await act(async () => { wait.resolve({ success: true }); });
  expect(props.onDone).toHaveBeenCalledOnce();
  view.rerender(<RenewDialog {...props} open={false} />);
  view.rerender(<RenewDialog {...props} />);
  await screen.findByRole('button', { name: 'تجديد' });
  expect(document.querySelector('select')).toHaveValue('1');
});
it('does not close a newly selected student dialog when an earlier student finishes saving', async () => {
  const wait = deferred<Awaited<ReturnType<typeof commands.renewStudentSubscription>>>();
  vi.spyOn(commands, 'renewStudentSubscription').mockReturnValueOnce(wait.promise);
  const view = render(<RenewDialog {...props} />);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'تجديد' }));
  view.rerender(<RenewDialog {...props} studentId="missing-new-student" studentName="New selection" />);
  await act(async () => { wait.resolve({ success: true }); });
  expect(props.onClose).not.toHaveBeenCalled();
  expect(props.onDone).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'تجديد — New selection' })).toBeInTheDocument();
});
it('uses the carried pricing agreement for the transfer preview and blocks a failed read', async () => {
  const source = payrollGroup(), target = payrollGroup({ id: 'group-2', name: 'Target', studentIds: [] });
  await dbPut('groups', target);
  render(<TransferDialog open studentId={studentId} studentName="Synthetic" fromGroupId={groupId} groups={[source, target]} courses={[course]} teachers={[]} onClose={() => {}} onDone={() => {}} />);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  await userEvent.setup().selectOptions(document.querySelector('select') as HTMLSelectElement, target.id);
  // 100 override minus 10% = 90, not the catalog's 200. Existing payment = 20.
  expect(screen.getByText(formatCurrency(90))).toBeInTheDocument();
  expect(screen.getByText(formatCurrency(70))).toBeInTheDocument();
});
it('does not treat transfer-preview failures as a zero paid balance', async () => {
  vi.spyOn(database, 'getDB').mockRejectedValue(new Error('Synthetic load failure'));
  render(<TransferDialog open studentId={studentId} studentName="Synthetic" fromGroupId={groupId} groups={[payrollGroup()]} courses={[course]} teachers={[]} onClose={() => {}} onDone={() => {}} />);
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'تأكيد التحويل' })).toBeDisabled();
  expect(screen.queryByText(/خالص/)).not.toBeInTheDocument();
});
it('ignores a slow old write-off scope review instead of overwriting the currently selected scope', async () => {
  const wait = deferred<Awaited<ReturnType<typeof debtService.reviewWriteOff>>>();
  const all = { scope: 'all' as const, today: '2026-09-24', fingerprint: 'synthetic', preview: { scope: 'all' as const, installmentsCount: 2, studentsCount: 2, amount: 200, overdueAmount: 0 } };
  vi.spyOn(debtService, 'reviewWriteOff').mockReturnValueOnce(wait.promise).mockResolvedValueOnce(all);
  render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={() => {}} />);
  await userEvent.setup().click(screen.getByRole('button', { name: /كل المتبقي/ }));
  await waitFor(() => expect(screen.getByTestId('writeoff-students')).toHaveTextContent('2'));
  await act(async () => { wait.resolve({ ...all, scope: 'due', preview: { ...all.preview, scope: 'due', studentsCount: 1 } }); });
  expect(screen.getByTestId('writeoff-students')).toHaveTextContent('2');
});
it('requires a new confirmation when liabilities change after the destructive preview', async () => {
  render(<WriteOffDebtsDialog isOpen onClose={() => {}} onDone={props.onDone} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /كل المتبقي/ }));
  await screen.findByTestId('writeoff-amount');
  await commands.renewStudentSubscription({ id: 'test-admin', username: 'Synthetic', role: 'admin' }, { studentId, groupId });
  const dialog = screen.getByRole('dialog');
  const inputs = within(dialog).getAllByRole('textbox');
  await user.type(inputs[0], 'Synthetic review');
  await user.type(inputs[1], 'تصفير');
  await user.click(screen.getByRole('button', { name: 'تأكيد التصفير' }));
  await screen.findByRole('alert');
  expect(props.onDone).not.toHaveBeenCalled();
  expect((await readAll('installments')).every(row => row.status !== 'cancelled')).toBe(true);
  expect(inputs[1]).toHaveValue('');
});


it('does not silently replace a deliberately cleared renewal date with an automatic date', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<RenewDialog {...props} />);
  await screen.findByRole('button', { name: 'تجديد' });
  fireEvent.change(document.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: '' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'تجديد' }));
  expect(await readAll('installments')).toHaveLength(1);
  expect(props.onDone).not.toHaveBeenCalled();
});

describe('QuickCollectDialog', () => {
  const collectTarget = {
    studentId: 'student-1',
    studentName: 'Synthetic student',
    remaining: 100,
    overdueAmount: 40,
    groupName: 'Synthetic group',
  };

  it('sets amounts via shortcuts and rejects amounts exceeding remaining', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <QuickCollectDialog
        isOpen
        target={collectTarget}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('المتبقي على المجموعة')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();

    // Click "نص المتبقي"
    await user.click(screen.getByRole('button', { name: 'نص المتبقي' }));
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();

    // Click "قيمة المتأخرات"
    await user.click(screen.getByRole('button', { name: 'قيمة المتأخرات' }));
    expect(screen.getByDisplayValue('40')).toBeInTheDocument();

    // Click "المتبقي كله"
    await user.click(screen.getByRole('button', { name: 'المتبقي كله' }));
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();

    // Try typing an excessive amount
    const amountInput = screen.getByDisplayValue('100');
    await user.clear(amountInput);
    await user.type(amountInput, '150');

    await user.click(screen.getByRole('button', { name: 'تأكيد التحصيل' }));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('successfully collects payment, notifies and invokes callbacks', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    vi.spyOn(commands, 'collectStudentPayment').mockResolvedValue({
      success: true,
      remainingAfter: 0,
    } as unknown as Awaited<ReturnType<typeof commands.collectStudentPayment>>);

    render(
      <QuickCollectDialog
        isOpen
        target={collectTarget}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await user.click(screen.getByRole('button', { name: 'تأكيد التحصيل' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });
});

