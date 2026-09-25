import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackupManager from '../components/BackupManager';
import { getBackupConfig, saveBackupConfig } from '../data/backupPreferences';
import type { BackupTransferResult } from '../domain/backup/settings';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';
import { notify } from '../lib/notifications';
import { backupToLocal } from '../services/backup/local';
import { executeBackup } from '../services/backup/runner';
import { stopBackupScheduler } from '../services/backup/scheduler';
import { finishBackupOperation, getBackupRuntime } from '../services/backup/state';

vi.mock('../contexts/AppContext', () => ({ useApp: () => ({ settings: DEFAULT_SETTINGS_VALUES }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-admin', username: 'synthetic', role: 'admin' } }) }));
vi.mock('../services/backup/local', () => ({ getDataSize: vi.fn(async () => '1 KB'), backupToLocal: vi.fn() }));
vi.mock('../services/cloudBackupService', () => ({ backupToCloud: vi.fn(async () => ({ success: true, size: 20 })) }));
vi.mock('../lib/security', () => ({ addAuditEntry: vi.fn() }));
vi.mock('../lib/notifications', () => ({ notify: { loading: vi.fn(() => 'backup-toast'), dismiss: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  stopBackupScheduler();
  finishBackupOperation('running');
  finishBackupOperation('restoring');
  localStorage.clear();
  delete window.electronAPI;
  vi.clearAllMocks();
  vi.mocked(backupToLocal).mockResolvedValue({ success: true, size: 10 });
});
afterEach(() => { stopBackupScheduler(); vi.restoreAllMocks(); delete window.electronAPI; });

describe('backup manager controller and sections', () => {
  it('shows real scheduler state after navigation and does not start it implicitly', async () => {
    const user = userEvent.setup();
    const first = render(<BackupManager />);
    expect(getBackupRuntime().schedulerActive).toBe(false);
    await user.click(screen.getByRole('button', { name: 'معطل' }));
    expect(getBackupRuntime().schedulerActive).toBe(true);
    first.unmount();
    expect(getBackupRuntime().schedulerActive).toBe(true);
    render(<BackupManager />);
    expect(screen.getByRole('button', { name: 'نشط' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'نشط' }));
    expect(getBackupRuntime().schedulerActive).toBe(false);
  });
  it('preserves in-flight state after remount and displays completion without local duplicated state', async () => {
    let resolve!: (value: BackupTransferResult) => void;
    vi.mocked(backupToLocal).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const user = userEvent.setup();
    const first = render(<BackupManager />);
    await user.click(screen.getByRole('button', { name: /نسخ احتياطي محلي/ }));
    expect(getBackupRuntime().running).toBe(true);
    first.unmount();
    render(<BackupManager />);
    expect(screen.getByRole('button', { name: /نسخ احتياطي محلي/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /استعادة من ملف/ })).toBeDisabled();
    await act(async () => { resolve({ success: true, size: 1024 }); });
    await waitFor(() => expect(screen.getByRole('button', { name: /نسخ احتياطي محلي/ })).toBeEnabled());
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    expect(getBackupConfig().totalBackups).toBe(1);
  });
  it('keeps unsaved preference edits during background completion and does not reset counters on save', async () => {
    const user = userEvent.setup();
    render(<BackupManager />);
    await user.selectOptions(screen.getByLabelText('الوجهة'), 'local');
    act(() => { saveBackupConfig({ totalBackups: 6 }); });
    await act(async () => { await executeBackup('local', false); });
    expect(screen.getByLabelText('الوجهة')).toHaveValue('local');
    await user.click(screen.getByRole('button', { name: 'حفظ الإعدادات' }));
    expect(getBackupConfig()).toMatchObject({ totalBackups: 7, lastBackupStatus: 'success', destination: 'local' });
  });
  it('updates failed-run history too, and lets the user clear it reactively', async () => {
    vi.mocked(backupToLocal).mockResolvedValueOnce({ success: false, size: 0, error: 'Synthetic failure' });
    const user = userEvent.setup();
    render(<BackupManager />);
    await user.click(screen.getByRole('button', { name: /نسخ احتياطي محلي/ }));
    await screen.findByText('فاشل');
    expect(screen.queryByText('لا توجد نسخ احتياطية بعد')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'مسح السجل' }));
    expect(screen.getByText('لا توجد نسخ احتياطية بعد')).toBeInTheDocument();
  });
  it('requires the same explicit confirmation before invoking native restore, and cancellation is inert', async () => {
    const restoreLocal = vi.fn(async () => ({ success: false, error: 'Synthetic cancellation' }));
    window.electronAPI = { isElectron: true, backup: { restoreLocal } } as unknown as ElectronAPI;
    const user = userEvent.setup();
    render(<BackupManager />);
    await user.click(screen.getByRole('button', { name: /استعادة من الجهاز/ }));
    let dialog = screen.getByRole('alertdialog');
    expect(restoreLocal).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }));
    expect(restoreLocal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /استعادة من الجهاز/ }));
    dialog = screen.getByRole('alertdialog');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.click(within(dialog).getByRole('button', { name: 'نعم، استعادة' }));
    await waitFor(() => expect(restoreLocal).toHaveBeenCalledOnce());
    expect(notify.error).toHaveBeenCalledWith('Synthetic cancellation');
    error.mockRestore();
  });
});
