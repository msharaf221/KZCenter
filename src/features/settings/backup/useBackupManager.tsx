import { useState, useSyncExternalStore } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { clearBackupHistory, getBackupConfig, getBackupHistory, getBackupPreferencesRevision, saveBackupPreferences, subscribeBackupPreferences } from '../../../data/backupPreferences';
import { backupPreferences, type BackupDestination } from '../../../domain/backup/settings';
import { requireRule, userErrorMessage } from '../../../domain/errors';
import { useAsyncResource } from '../../../hooks/useAsyncResource';
import { useCommandTask } from '../../../hooks/useCommandTask';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import { notify } from '../../../lib/notifications';
import { getDataSize } from '../../../services/backup/local';
import { restoreConfirmedBackup } from '../../../services/backup/restore';
import { executeBackup } from '../../../services/backup/runner';
import { startBackupScheduler, stopBackupScheduler } from '../../../services/backup/scheduler';
import { getBackupRuntime, subscribeBackupRuntime } from '../../../services/backup/state';
import { requirePermission } from '../../../services/commands/access';

export function useBackupManager() {
  const { user } = useAuth();
  useSyncExternalStore(subscribeBackupPreferences, getBackupPreferencesRevision, getBackupPreferencesRevision);
  const runtime = useSyncExternalStore(subscribeBackupRuntime, getBackupRuntime, getBackupRuntime);
  const config = getBackupConfig();
  const history = getBackupHistory().logs;
  const [preferences, setPreferences] = useState(() => backupPreferences(getBackupConfig()));
  const { data: dataSize, reload: reloadSize } = useAsyncResource(getDataSize, '...');
  const task = useCommandTask();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  function handleToggleScheduler() {
    try {
      requirePermission(user, 'backup', 'edit');
      if (runtime.schedulerActive) { stopBackupScheduler(); notify.info('تم إيقاف المجدول'); }
      else { startBackupScheduler(); notify.success('تم تشغيل المجدول'); }
    } catch (error) { notify.error(userErrorMessage(error)); }
  }
  async function handleManualBackup(destination: BackupDestination) {
    await task.run(async () => {
      requirePermission(user, 'backup', 'export');
      await executeBackup(destination, true);
      await reloadSize();
    });
  }
  async function requestRestore(source: 'local' | 'file', file?: File) {
    await task.run(async () => {
      requirePermission(user, 'backup', 'edit');
      if (source === 'local') requireRule(window.electronAPI?.isElectron, 'هذه الميزة متاحة فقط في تطبيق سطح المكتب');
      const confirmed = await confirm({
        title: 'استعادة نسخة احتياطية',
        message: 'هل أنت متأكد من الاستعادة؟ سيتم استبدال بيانات الجداول الموجودة في النسخة المختارة. يُنصح بحفظ نسخة من البيانات الحالية أولاً.',
        confirmLabel: 'نعم، استعادة', danger: true,
      });
      if (!confirmed) return;
      const content = file ? await file.text() : undefined;
      if (await restoreConfirmedBackup(user, source, confirmed, content)) window.location.reload();
    });
  }
  function handleRestoreFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => { const file = input.files?.[0]; if (file) void requestRestore('file', file); };
    input.click();
  }
  function handleSaveConfig() {
    try { requirePermission(user, 'backup', 'edit'); saveBackupPreferences(preferences); notify.success('تم حفظ إعدادات النسخ الاحتياطي'); }
    catch (error) { notify.error(userErrorMessage(error, 'تعذّر حفظ إعدادات النسخ الاحتياطي')); }
  }
  function handleClearHistory() {
    try { requirePermission(user, 'backup', 'edit'); clearBackupHistory(); }
    catch (error) { notify.error(userErrorMessage(error, 'تعذّر مسح سجل النسخ الاحتياطي')); }
  }
  return {
    config, preferences, setPreferences, history, dataSize,
    isRunning: runtime.running || runtime.restoring || task.pending,
    schedulerActive: runtime.schedulerActive,
    confirmDialog, handleToggleScheduler, handleManualBackup, handleRestoreFromFile,
    handleRestoreFromLocal: () => requestRestore('local'), handleSaveConfig, handleClearHistory,
  };
}
