import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import DataMaintenanceSection from '../features/settings/DataMaintenanceSection';
import { getDB } from '../data/database';
import { dbPut } from '../data/records';
import { readAll } from '../data/readers';
import * as commands from '../services/commands/maintenance';
import { notify } from '../lib/notifications';
import { payrollStudent, payrollGroup, PAYROLL_NOW } from './helpers/payroll';
import { DEFAULT_SUBJECT_PRICES } from '../lib/subjects';

const identity = vi.hoisted(() => ({ role: 'admin' as 'admin' | 'secretary' }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-user', username: 'Synthetic', role: identity.role } }) }));
vi.mock('../lib/audit', () => ({ addAuditEntry: vi.fn() }));
vi.mock('../lib/notifications', () => ({ notify: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
beforeEach(async () => {
  identity.role = 'admin'; vi.clearAllMocks();
  const db = await getDB(); for (const name of db.objectStoreNames) await db.clear(name);
  await dbPut('students', payrollStudent()); await dbPut('groups', payrollGroup());
  await dbPut('courses', { id: 'course-1', name: 'رياضيات', price: 0, durationMonths: 1, category: 'test', levels: [], color: '#000000', icon: 'x', createdAt: PAYROLL_NOW, updatedAt: PAYROLL_NOW });
});
afterEach(() => vi.restoreAllMocks());
const renderSection = () => render(<DataMaintenanceSection primaryColor="#6366f1" subjectPrices={DEFAULT_SUBJECT_PRICES} />);

it('makes read-only auditing explicit and does not perform repairs during the audit', async () => {
  renderSection(); await userEvent.setup().click(screen.getByRole('button', { name: 'افحص الداتا' }));
  await screen.findByRole('button', { name: 'إصلاح تلقائي' });
  expect((await readAll('courses'))[0].price).toBe(0);
  expect(await readAll('enrollments')).toEqual([]);
});
it('requires confirmation for link repair and keeps cancellation inert', async () => {
  renderSection(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'فحص وإصلاح الآن' }));
  const dialog = screen.getByRole('alertdialog');
  expect(screen.getByRole('button', { name: 'افحص الداتا' })).toBeDisabled();
  expect(await readAll('enrollments')).toEqual([]);
  await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
  expect(await readAll('enrollments')).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'فحص وإصلاح الآن' }));
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد الإصلاح' }));
  await waitFor(async () => expect(await readAll('enrollments')).toHaveLength(1));
  await screen.findByText('نتيجة الفحص:');
});
it('commits confirmed catalog repair and shows its returned report', async () => {
  renderSection(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'افحص الداتا' }));
  await user.click(await screen.findByRole('button', { name: 'إصلاح تلقائي' }));
  expect((await readAll('courses'))[0].price).toBe(0);
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد الإصلاح' }));
  await waitFor(async () => expect((await readAll('courses'))[0].price).toBeGreaterThan(0));
  expect(notify.success).toHaveBeenCalledWith(expect.stringContaining('سعر اتظبط'));
});
it('denies maintenance mutations without settings permission even if the component is rendered directly', async () => {
  identity.role = 'secretary'; renderSection(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'فحص وإصلاح الآن' }));
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد الإصلاح' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('صلاحية')));
  expect(await readAll('enrollments')).toEqual([]);
});
it('does not apply a repair when the pending confirmation is unmounted', async () => {
  const command = vi.spyOn(commands, 'repairDataLinks');
  const view = renderSection();
  await userEvent.setup().click(screen.getByRole('button', { name: 'فحص وإصلاح الآن' }));
  view.unmount(); await act(async () => {});
  expect(command).not.toHaveBeenCalled();
});
it('guards double starts immediately, before the disabled state renders', async () => {
  const command = vi.spyOn(commands, 'repairDataLinks'); renderSection();
  const button = screen.getByRole('button', { name: 'فحص وإصلاح الآن' });
  fireEvent.click(button); fireEvent.click(button);
  await userEvent.setup().click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'تأكيد الإصلاح' }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
});
