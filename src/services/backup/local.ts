import { formatBackupSize, type BackupTransferResult } from '../../domain/backup/settings';
import { exportAllData } from '../backupService';

export async function backupToLocal(): Promise<BackupTransferResult> {
  try {
    const json = JSON.stringify(await exportAllData(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    if (window.electronAPI?.isElectron) {
      const result = await window.electronAPI.backup.saveLocal(json);
      return { success: result.success, size: blob.size, error: result.error };
    }
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `educenter_auto_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } finally { URL.revokeObjectURL(url); }
    return { success: true, size: blob.size };
  } catch (error) { return { success: false, size: 0, error: String(error) }; }
}
export async function getDataSize(): Promise<string> {
  try { return formatBackupSize(new Blob([JSON.stringify(await exportAllData())]).size); }
  catch { return 'غير معروف'; }
}
