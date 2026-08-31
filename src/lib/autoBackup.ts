/**
 * Auto Backup System
 * نظام النسخ الاحتياطي التلقائي
 */

import { notify } from './notifications';

const BACKUP_REMINDER_KEY = 'educenter_last_backup_reminder'; // legacy key - kept for backwards compatibility
const BACKUP_LAST_KEY = 'educenter_last_backup_at';
const BACKUP_REMINDER_SHOWN_KEY = 'educenter_last_backup_reminder_shown';
const BACKUP_CONFIG_KEY = 'educenter_backup_config'; // same key used by dailyBackup.ts
const BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

function readTimestamp(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Returns the timestamp of the latest *successful* backup.
 *
 * It reads the daily backup config first (so backups taken from the Settings
 * page count), then falls back to the new/legacy reminder keys for older
 * versions.
 */
function getLastBackupTimestamp(): number | null {
  try {
    const rawConfig = localStorage.getItem(BACKUP_CONFIG_KEY);
    if (rawConfig) {
      const config = JSON.parse(rawConfig);
      if (
        config?.lastBackupDate &&
        (!config.lastBackupStatus || config.lastBackupStatus === 'success')
      ) {
        const time = new Date(config.lastBackupDate).getTime();
        if (Number.isFinite(time)) return time;
      }
    }
  } catch {
    // ignore malformed config and fall back to the dedicated keys below
  }

  return readTimestamp(BACKUP_LAST_KEY) ?? readTimestamp(BACKUP_REMINDER_KEY);
}

export function checkBackupReminder(): boolean {
  // Don't nag again for the same reminder period.
  const lastShown = readTimestamp(BACKUP_REMINDER_SHOWN_KEY);
  if (lastShown !== null && Date.now() - lastShown < BACKUP_INTERVAL) {
    return false;
  }

  const lastBackup = getLastBackupTimestamp();
  if (lastBackup === null) return true;

  const elapsed = Date.now() - lastBackup;
  return elapsed > BACKUP_INTERVAL;
}

export function markBackupDone(): void {
  const now = Date.now().toString();
  localStorage.setItem(BACKUP_LAST_KEY, now);
  localStorage.setItem(BACKUP_REMINDER_KEY, now);
  // A fresh backup resets the "already reminded" state.
  localStorage.removeItem(BACKUP_REMINDER_SHOWN_KEY);
}

export function markBackupReminderShown(): void {
  localStorage.setItem(BACKUP_REMINDER_SHOWN_KEY, Date.now().toString());
}

export function showBackupReminder(): void {
  if (checkBackupReminder()) {
    notify.warning('لم تقم بعمل نسخة احتياطية منذ أسبوع. يُنصح بالتصدير من صفحة الإعدادات.');
    markBackupReminderShown();
  }
}
