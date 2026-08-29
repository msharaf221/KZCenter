/**
 * Auto Backup Tests
 * اختبارات النسخ الاحتياطي التلقائي
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkBackupReminder,
  markBackupDone,
  markBackupReminderShown,
} from '../lib/autoBackup';

beforeEach(() => {
  localStorage.clear();
});

describe('Auto Backup', () => {
  it('shows reminder when no previous backup', () => {
    expect(checkBackupReminder()).toBe(true);
  });

  it('does not show reminder after recent backup', () => {
    markBackupDone();
    expect(checkBackupReminder()).toBe(false);
  });

  it('shows reminder after 7 days', () => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000 - 1;
    localStorage.setItem('educenter_last_backup_reminder', sevenDaysAgo.toString());
    expect(checkBackupReminder()).toBe(true);
  });

  it('does not show reminder within 7 days', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    localStorage.setItem('educenter_last_backup_reminder', threeDaysAgo.toString());
    expect(checkBackupReminder()).toBe(false);
  });

  it('does not nag on every dashboard open after the reminder was shown', () => {
    markBackupReminderShown();
    expect(checkBackupReminder()).toBe(false);
  });

  it('shows the reminder again after a week even if no backup was made', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem('educenter_last_backup_reminder_shown', eightDaysAgo.toString());
    expect(checkBackupReminder()).toBe(true);
  });

  it('stops reminding once a backup is made', () => {
    markBackupReminderShown();
    markBackupDone();
    expect(checkBackupReminder()).toBe(false);
  });

  it('counts backups taken from the settings page backup config', () => {
    localStorage.setItem('educenter_backup_config', JSON.stringify({
      enabled: true,
      destination: 'both',
      time: '02:00',
      keepDays: 30,
      lastBackupDate: new Date().toISOString(),
      lastBackupStatus: 'success',
      lastBackupError: null,
      totalBackups: 1,
    }));
    expect(checkBackupReminder()).toBe(false);
  });
});
