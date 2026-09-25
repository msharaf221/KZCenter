import type { BackupConfig } from './settings';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Preserve the explicit scheduler's exact local-minute match and once-per-local-day attempt. */
export function isBackupDue(config: BackupConfig, now: Date): boolean {
  if (!config.enabled) return false;
  const [hour, minute] = config.time.split(':').map(Number);
  return now.getHours() === hour && now.getMinutes() === minute
    && (!config.lastBackupDate || localDateKey(new Date(config.lastBackupDate)) !== localDateKey(now));
}
export function backupOverdue(config: BackupConfig, now: Date): boolean {
  return config.enabled && (!config.lastBackupDate || now.getTime() - new Date(config.lastBackupDate).getTime() > 24 * 60 * 60 * 1000);
}
