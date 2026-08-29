/**
 * Auto Backup System
 * نظام النسخ الاحتياطي التلقائي
 */

import { exportAllData } from './db';
import { notify } from './notifications';

const BACKUP_REMINDER_KEY = 'educenter_last_backup_reminder';
const BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

export function checkBackupReminder(): boolean {
  const lastReminder = localStorage.getItem(BACKUP_REMINDER_KEY);
  if (!lastReminder) return true;

  const elapsed = Date.now() - parseInt(lastReminder, 10);
  return elapsed > BACKUP_INTERVAL;
}

export function markBackupDone(): void {
  localStorage.setItem(BACKUP_REMINDER_KEY, Date.now().toString());
}

export function showBackupReminder(): void {
  if (checkBackupReminder()) {
    notify.warning('لم تقم بعمل نسخة احتياطية منذ أسبوع. يُنصح بالتصدير من صفحة الإعدادات.');
  }
}

// Auto-export backup to download
export async function autoExportBackup(): Promise<void> {
  try {
    const data = await exportAllData();
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eduCenter_auto_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    markBackupDone();
    notify.success('تم تصدير النسخة الاحتياطية التلقائية');
  } catch (error) {
    console.error('Auto backup failed:', error);
    notify.error('فشل النسخ الاحتياطي التلقائي');
  }
}

// Calculate data size in localStorage/IndexedDB
export async function estimateDataSize(): Promise<string> {
  try {
    const data = await exportAllData();
    const jsonString = JSON.stringify(data);
    const bytes = new Blob([jsonString]).size;

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return 'غير معروف';
  }
}
