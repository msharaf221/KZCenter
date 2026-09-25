import { getBackupConfig } from '../../data/backupPreferences';
import { backupOverdue, isBackupDue } from '../../domain/backup/schedule';
import { executeBackup } from './runner';
import { setSchedulerActive } from './state';

let timer: ReturnType<typeof setInterval> | null = null;
/** Explicit activation only; navigation/remounting never starts or stops the scheduler. */
export function startBackupScheduler(): void {
  stopBackupScheduler();
  timer = setInterval(() => {
    const config = getBackupConfig();
    if (isBackupDue(config, new Date())) void executeBackup(config.destination, true);
  }, 60_000);
  setSchedulerActive(true);
}
export function stopBackupScheduler(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  setSchedulerActive(false);
}
export function isBackupOverdue(): boolean { return backupOverdue(getBackupConfig(), new Date()); }
