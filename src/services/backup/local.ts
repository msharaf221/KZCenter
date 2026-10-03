import { formatBackupSize, type BackupTransferResult } from '../../domain/backup/settings';
import { exportAllData } from '../backupService';

export async function backupToLocal(): Promise<BackupTransferResult> {
  try {
    const rawData = await exportAllData();
    const json = JSON.stringify(rawData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const today = new Date().toISOString().split('T')[0];
    const filename = `backup_${today}.json`;

    // 1. Attempt to save directly into project's backups/ directory via dev/server API
    try {
      if (typeof fetch === 'function') {
        await fetch('/__api/backup/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, data: rawData }),
        });
      }
    } catch {
      // Ignore network errors in offline/static environments
    }

    // 2. If running under Electron, save via desktop IPC
    if (window.electronAPI?.isElectron) {
      const result = await window.electronAPI.backup.saveLocal(json);
      return { success: result.success, size: blob.size, error: result.error };
    }

    // 3. Trigger immediate browser download
    if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    return { success: true, size: blob.size };
  } catch (error) {
    return { success: false, size: 0, error: String(error) };
  }
}

export async function getDataSize(): Promise<string> {
  try {
    return formatBackupSize(new Blob([JSON.stringify(await exportAllData())]).size);
  } catch {
    return 'غير معروف';
  }
}
