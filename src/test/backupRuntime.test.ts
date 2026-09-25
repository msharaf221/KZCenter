import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_CONFIG_KEY, BACKUP_HISTORY_KEY, addBackupLog, clearBackupHistory, getBackupConfig, getBackupHistory, getBackupPreferencesRevision, saveBackupConfig, saveBackupPreferences, subscribeBackupPreferences } from '../data/backupPreferences';
import { backupOverdue, isBackupDue } from '../domain/backup/schedule';
import { backupPreferences, normalizeBackupConfig, normalizeBackupHistory, type BackupDestination, type BackupTransferResult } from '../domain/backup/settings';
import { checkBackupReminder } from '../lib/autoBackup';
import { notify } from '../lib/notifications';
import { executeBackup } from '../services/backup/runner';
import { startBackupScheduler, stopBackupScheduler } from '../services/backup/scheduler';
import { claimBackupOperation, finishBackupOperation, getBackupRuntime, subscribeBackupRuntime } from '../services/backup/state';
import { backupToLocal } from '../services/backup/local';
import { backupToCloud } from '../services/cloudBackupService';

vi.mock('../services/backup/local', () => ({ backupToLocal: vi.fn() }));
vi.mock('../services/cloudBackupService', () => ({ backupToCloud: vi.fn() }));
vi.mock('../lib/security', () => ({ addAuditEntry: vi.fn() }));
vi.mock('../lib/notifications', () => ({ notify: { loading: vi.fn(() => 'synthetic-backup-toast'), dismiss: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  stopBackupScheduler();
  finishBackupOperation('running');
  finishBackupOperation('restoring');
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(backupToLocal).mockResolvedValue({ success: true, size: 100 });
  vi.mocked(backupToCloud).mockResolvedValue({ success: true, size: 200 });
});
afterEach(() => { stopBackupScheduler(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('backup preference boundaries', () => {
  it.each([null, [], 'not a config', { time: '25:61', enabled: 'false', destination: 'invalid', keepDays: -1, totalBackups: -1, lastBackupDate: 'bad', lastBackupStatus: { toString: 'bad' } }])('normalizes malformed persisted config: %j', value => {
    const result = normalizeBackupConfig(value);
    expect(result).toEqual(normalizeBackupConfig(null));
    result.time = '03:00';
    expect(normalizeBackupConfig(null).time).toBe('02:00');
  });
  it('recovers from invalid JSON and normalizes malformed history entries', () => {
    localStorage.setItem(BACKUP_CONFIG_KEY, '{broken');
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify({ logs: [null, { id: 'x', status: 'success' }] }));
    expect(getBackupConfig().time).toBe('02:00');
    expect(getBackupHistory()).toEqual({ logs: [] });
    expect(normalizeBackupHistory({ logs: 'wrong' })).toEqual({ logs: [] });
  });
  it.each([{ time: '' }, { time: '2:00' }, { time: '24:00' }, { keepDays: 0 }, { keepDays: 366 }, { keepDays: 1.5 }, { keepDays: NaN }])('rejects invalid editable preferences without writing: %j', patch => {
    const before = localStorage.getItem(BACKUP_CONFIG_KEY);
    expect(() => saveBackupPreferences({ ...backupPreferences(getBackupConfig()), ...patch })).toThrow();
    expect(localStorage.getItem(BACKUP_CONFIG_KEY)).toBe(before);
  });
  it('never overwrites fresh counters/status when an older form saves preferences', () => {
    const staleForm = getBackupConfig();
    saveBackupConfig({ totalBackups: 9, lastBackupStatus: 'success', lastBackupDate: new Date().toISOString() });
    saveBackupPreferences({ ...staleForm, time: '05:30' });
    expect(getBackupConfig()).toMatchObject({ time: '05:30', totalBackups: 9, lastBackupStatus: 'success' });
  });
  it('caps history at the latest 100 entries and publishes saves/clears/storage events', () => {
    const listener = vi.fn();
    const start = getBackupPreferencesRevision();
    const unsubscribe = subscribeBackupPreferences(listener);
    for (let i = 0; i < 105; i++) addBackupLog({ id: `synthetic-${i}`, date: new Date().toISOString(), destination: 'local', status: 'success', size: i, duration: 1 });
    expect(getBackupHistory().logs).toHaveLength(100);
    expect(getBackupHistory().logs[0].id).toBe('synthetic-104');
    clearBackupHistory();
    expect(getBackupHistory().logs).toEqual([]);
    window.dispatchEvent(new StorageEvent('storage', { key: BACKUP_CONFIG_KEY }));
    expect(getBackupPreferencesRevision()).toBe(start + 107);
    expect(listener).toHaveBeenCalledTimes(107);
    unsubscribe();
    saveBackupConfig({ time: '03:00' });
    expect(listener).toHaveBeenCalledTimes(107);
  });
});

describe('shared backup execution state', () => {
  it.each([['local', 100, 1, 0], ['cloud', 200, 0, 1], ['both', 300, 1, 1]] as const)('executes %s, logs once, updates counts and weekly reminders', async (destination, size, localCalls, cloudCalls) => {
    expect((await executeBackup(destination)).success).toBe(true);
    expect(backupToLocal).toHaveBeenCalledTimes(localCalls);
    expect(backupToCloud).toHaveBeenCalledTimes(cloudCalls);
    expect(getBackupConfig()).toMatchObject({ totalBackups: 1, lastBackupStatus: 'success' });
    expect(getBackupHistory().logs).toEqual([expect.objectContaining({ destination, size, status: 'success' })]);
    expect(getBackupRuntime().running).toBe(false);
    expect(checkBackupReminder()).toBe(false);
    expect(notify.dismiss).toHaveBeenCalledExactlyOnceWith('synthetic-backup-toast');
  });
  it('uses normalized saved preferences by default and rejects unknown destinations', async () => {
    saveBackupPreferences({ ...backupPreferences(getBackupConfig()), destination: 'local' });
    expect((await executeBackup(undefined, false)).success).toBe(true);
    expect((await executeBackup('invalid' as BackupDestination, false)).success).toBe(false);
    expect(backupToCloud).not.toHaveBeenCalled();
    expect(notify.loading).not.toHaveBeenCalled();
    expect(getBackupRuntime().running).toBe(false);
  });
  it('rejects overlapping manual/scheduled operations and stays observable across subscriptions', async () => {
    const wait = deferred<BackupTransferResult>();
    vi.mocked(backupToLocal).mockReturnValueOnce(wait.promise);
    const listener = vi.fn();
    const unsubscribe = subscribeBackupRuntime(listener);
    const run = executeBackup('local', false);
    expect(getBackupRuntime().running).toBe(true);
    expect((await executeBackup('cloud', false)).success).toBe(false);
    expect(claimBackupOperation('restoring')).toBe(false);
    unsubscribe();
    const remountListener = vi.fn();
    const remountUnsubscribe = subscribeBackupRuntime(remountListener);
    wait.resolve({ success: true, size: 1 });
    await run;
    expect(remountListener).toHaveBeenCalledOnce();
    expect(backupToCloud).not.toHaveBeenCalled();
    expect(getBackupConfig().totalBackups).toBe(1);
    remountUnsubscribe();
  });
  it('keeps all destination failures, including exceptions, without incrementing successful totals', async () => {
    vi.mocked(backupToLocal).mockRejectedValueOnce(new Error('Synthetic local failure'));
    vi.mocked(backupToCloud).mockResolvedValueOnce({ success: false, size: 0, error: 'Synthetic cloud failure' });
    const result = await executeBackup('both', false);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/local failure.*cloud failure/) });
    expect(getBackupConfig()).toMatchObject({ totalBackups: 0, lastBackupStatus: 'error' });
    expect(getBackupHistory().logs).toHaveLength(1);
    expect(getBackupRuntime().running).toBe(false);
    expect(checkBackupReminder()).toBe(true);
  });
  it('records partial success sizes but never counts a partial both-destination run as success', async () => {
    vi.mocked(backupToCloud).mockResolvedValueOnce({ success: false, size: 200, error: 'Synthetic cloud failure' });
    expect((await executeBackup('both', false)).success).toBe(false);
    expect(getBackupHistory().logs[0]).toMatchObject({ size: 100, status: 'error' });
    expect(getBackupConfig().totalBackups).toBe(0);
  });
  it('does not turn a completed backup into a failure when metadata storage is full, and releases its lock', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Synthetic quota', 'QuotaExceededError'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await executeBackup('local', false)).toMatchObject({ success: true, warning: expect.any(String) });
    expect(getBackupRuntime().running).toBe(false);
    expect((await executeBackup('local', false)).success).toBe(true);
  });
  it('does not let a broken observer wedge the operation lock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsubscribe = subscribeBackupRuntime(() => { throw new Error('Synthetic observer'); });
    expect((await executeBackup('local', false)).success).toBe(true);
    expect(getBackupRuntime().running).toBe(false);
    unsubscribe();
  });
});

describe('explicit local-time backup scheduling', () => {
  it('checks local date boundaries, the exact minute, enabled and overdue policies', () => {
    const now = new Date(2026, 8, 24, 2, 0);
    const config = getBackupConfig();
    expect(isBackupDue(config, now)).toBe(true);
    expect(isBackupDue(config, new Date(2026, 8, 24, 2, 1))).toBe(false);
    expect(isBackupDue({ ...config, enabled: false }, now)).toBe(false);
    expect(isBackupDue({ ...config, lastBackupDate: new Date(2026, 8, 23, 23, 59).toISOString() }, now)).toBe(true);
    expect(isBackupDue({ ...config, lastBackupDate: new Date(2026, 8, 24, 0, 1).toISOString() }, now)).toBe(false);
    expect(backupOverdue(config, now)).toBe(true);
    expect(backupOverdue({ ...config, enabled: false }, now)).toBe(false);
    expect(backupOverdue({ ...config, lastBackupDate: new Date(now.getTime() - 24 * 3600_000).toISOString() }, now)).toBe(false);
    expect(backupOverdue({ ...config, lastBackupDate: new Date(now.getTime() - 24 * 3600_000 - 1).toISOString() }, now)).toBe(true);
  });
  it('does not auto-start, creates one interval, survives navigation, and attempts only once per local day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 1, 59));
    saveBackupConfig({ destination: 'local' });
    expect(getBackupRuntime().schedulerActive).toBe(false);
    startBackupScheduler();
    startBackupScheduler();
    expect(vi.getTimerCount()).toBe(1);
    expect(getBackupRuntime().schedulerActive).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backupToLocal).toHaveBeenCalledOnce();
    // Returning to the same target minute later that local day must not repeat the attempt.
    vi.setSystemTime(new Date(2026, 8, 24, 1, 59));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backupToLocal).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date(2026, 8, 25, 1, 59));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backupToLocal).toHaveBeenCalledTimes(2);
    stopBackupScheduler();
    expect(vi.getTimerCount()).toBe(0);
    expect(getBackupRuntime().schedulerActive).toBe(false);
  });
  it('does not execute disabled schedules or bypass an in-progress restore', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 1, 59));
    saveBackupConfig({ enabled: false, destination: 'local' });
    startBackupScheduler();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backupToLocal).not.toHaveBeenCalled();
    saveBackupConfig({ enabled: true });
    claimBackupOperation('restoring');
    vi.setSystemTime(new Date(2026, 8, 24, 1, 59));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(backupToLocal).not.toHaveBeenCalled();
    finishBackupOperation('restoring');
  });
});
