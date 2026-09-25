import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import DashboardPage from '../pages/DashboardPage';
import { refreshDebtAlert } from '../lib/debtAlerts';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';
import { getDebtors, type DebtorRow } from '../services/balanceService';

vi.mock('../components/layout/Layout', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('../contexts/AppContext', () => ({ useApp: () => ({ settings: DEFAULT_SETTINGS_VALUES }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' }, can: () => true }) }));
vi.mock('../services/balanceService', () => ({ getDebtors: vi.fn() }));
vi.mock('../services/startupMaintenance', () => ({ runStartupMaintenance: vi.fn(async () => {}) }));
vi.mock('../services/queries/dashboard', async original => {
  const actual = await original<typeof import('../services/queries/dashboard')>();
  return { ...actual, loadDashboardData: vi.fn(async () => actual.emptyDashboardData()) };
});
vi.mock('recharts', async original => ({ ...(await original<typeof import('recharts')>()), ResponsiveContainer: () => null }));
afterEach(() => vi.restoreAllMocks());

it('distinguishes initial debt loading, failed refresh, and a genuinely empty accepted result', async () => {
  let resolve!: (rows: DebtorRow[]) => void;
  vi.mocked(getDebtors).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
  await screen.findByText('جاري تحديث أرصدة الطلاب');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('كل الطلاب مسددين')).not.toBeInTheDocument();
  await act(async () => { resolve([]); });
  await screen.findByText('كل الطلاب مسددين');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getDebtors).mockRejectedValueOnce(new Error('Synthetic refresh failure'));
  await act(async () => { await refreshDebtAlert(true); });
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('كل الطلاب مسددين')).not.toBeInTheDocument();
  vi.mocked(getDebtors).mockResolvedValueOnce([]);
  await userEvent.setup().click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText('كل الطلاب مسددين')).toBeInTheDocument();
});
