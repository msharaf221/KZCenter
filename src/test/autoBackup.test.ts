/**
 * Auto Backup Tests
 * اختبارات النسخ الاحتياطي التلقائي
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkBackupReminder, markBackupDone } from '../lib/autoBackup';

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
});
