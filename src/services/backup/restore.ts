import { DB_VERSION } from '../../data/database';
import { BACKUP_STORES } from '../../data/stores';
import { planBackupImport } from '../../domain/backup/format';
import { requireRule, userErrorMessage } from '../../domain/errors';
import { notify } from '../../lib/notifications';
import { addAuditEntry } from '../../lib/security';
import { importAllData } from '../backupService';
import { requirePermission, type Actor } from '../commands/access';
import { claimBackupOperation, finishBackupOperation } from './state';

/** Legacy transport API. The UI uses the permission/confirmation command below. */
export async function restoreBackup(source: 'local' | 'file', fileContent?: string): Promise<boolean> {
  if (!claimBackupOperation('restoring')) {
    notify.error('انتظر انتهاء النسخ الاحتياطي أو الاستعادة الحالية');
    return false;
  }
  try {
    let text = fileContent;
    if (source === 'local' && window.electronAPI?.isElectron) {
      const result = await window.electronAPI.backup.restoreLocal();
      requireRule(result.success && result.data, result.error || 'فشل في قراءة النسخة الاحتياطية');
      text = result.data;
    }
    requireRule(text, 'لم يتم اختيار ملف');
    const parsed: unknown = JSON.parse(text);
    planBackupImport(parsed, [...BACKUP_STORES, 'users'], DB_VERSION, true);
    await importAllData(parsed as Record<string, unknown>);
    try {
      addAuditEntry({ userId: 'system', username: 'نظام النسخ الاحتياطي', action: 'import', entity: 'backup', details: `استعادة نسخة احتياطية من ${source === 'local' ? 'الجهاز' : 'ملف'}` });
    } catch (error) {
      console.error('Restore audit failed after commit:', error);
      notify.warning('تمت الاستعادة لكن تعذّر حفظ سجل العملية.');
    }
    notify.success('تم استعادة النسخة الاحتياطية بنجاح');
    return true;
  } catch (error) {
    console.error('Restore failed:', error);
    notify.error(userErrorMessage(error, 'فشل في استعادة النسخة الاحتياطية. لم يتم استبدال البيانات.'));
    return false;
  } finally { finishBackupOperation('restoring'); }
}

export async function restoreConfirmedBackup(actor: Actor, source: 'local' | 'file', confirmed: boolean, fileContent?: string): Promise<boolean> {
  requirePermission(actor, 'backup', 'edit');
  requireRule(confirmed, 'يجب تأكيد استعادة النسخة الاحتياطية أولاً');
  return restoreBackup(source, fileContent);
}
