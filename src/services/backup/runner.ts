import { addBackupLog, getBackupConfig, saveBackupConfig } from '../../data/backupPreferences';
import { formatBackupSize, isBackupDestination, type BackupDestination, type BackupResult, type BackupTransferResult } from '../../domain/backup/settings';
import { markBackupDone } from '../../lib/autoBackup';
import { generateId } from '../../lib/ids';
import { notify } from '../../lib/notifications';
import { addAuditEntry } from '../../lib/security';
import { backupToCloud } from '../cloudBackupService';
import { backupToLocal } from './local';
import { claimBackupOperation, finishBackupOperation } from './state';

export async function executeBackup(destination?: BackupDestination, showNotification = true): Promise<BackupResult> {
  if (!claimBackupOperation('running')) return { success: false, error: 'النسخ الاحتياطي أو الاستعادة قيد التنفيذ بالفعل' };
  const start = Date.now();
  let toastId: string | undefined;
  try {
    const dest = destination || getBackupConfig().destination;
    if (!isBackupDestination(dest)) return { success: false, error: 'وجهة النسخ الاحتياطي غير صالحة' };
    if (showNotification) toastId = notify.loading('جاري النسخ الاحتياطي...');
    const failures: string[] = [];
    let size = 0;
    async function transfer(label: string, work: () => Promise<BackupTransferResult>) {
      try {
        const result = await work();
        if (result.success) size += result.size;
        else failures.push(`${label}: ${result.error || 'تعذّر إتمام النسخ الاحتياطي'}`);
      } catch (error) { failures.push(`${label}: ${String(error)}`); }
    }
    if (dest === 'local' || dest === 'both') await transfer('محلي', backupToLocal);
    if (dest === 'cloud' || dest === 'both') await transfer('سحابي', backupToCloud);
    const success = failures.length === 0;
    const error = success ? undefined : failures.join(' | ');
    const date = new Date().toISOString();
    const duration = Date.now() - start;
    let metadataFailed = false;
    // A completed file/cloud write is not undone by a full localStorage quota or audit failure.
    const remember = (work: () => void) => {
      try { work(); } catch (error) { metadataFailed = true; console.error('Backup metadata write failed:', error); }
    };
    remember(() => addBackupLog({ id: generateId(), date, destination: dest, status: success ? 'success' : 'error', size, duration, error }));
    remember(() => saveBackupConfig({ lastBackupDate: date, lastBackupStatus: success ? 'success' : 'error', lastBackupError: error || null, totalBackups: getBackupConfig().totalBackups + (success ? 1 : 0) }));
    remember(() => addAuditEntry({ userId: 'system', username: 'نظام النسخ الاحتياطي', action: 'backup', entity: 'backup', details: `نسخ احتياطي ${success ? 'ناجح' : 'فاشل'} - الوجهة: ${dest} - الحجم: ${formatBackupSize(size)} - المدة: ${duration}ms` }));
    if (success) remember(markBackupDone);
    const warning = metadataFailed ? 'تعذّر حفظ بعض معلومات سجل النسخ الاحتياطي على الجهاز.' : undefined;
    if (showNotification) {
      if (success) notify.success(`تم النسخ الاحتياطي بنجاح (${formatBackupSize(size)})`);
      else notify.error(`فشل النسخ الاحتياطي: ${error}`);
      if (warning) notify.warning(warning);
    }
    return { success, error, ...(warning ? { warning } : {}) };
  } catch (error) {
    if (showNotification) notify.error('حدث خطأ أثناء النسخ الاحتياطي');
    return { success: false, error: String(error) };
  } finally {
    finishBackupOperation('running');
    if (toastId) notify.dismiss(toastId);
  }
}
