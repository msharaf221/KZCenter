import { useApp } from '../contexts/AppContext';
import BackupActions from '../features/settings/backup/BackupActions';
import BackupHistoryList from '../features/settings/backup/BackupHistoryList';
import BackupPreferencesForm from '../features/settings/backup/BackupPreferencesForm';
import BackupStatusCard from '../features/settings/backup/BackupStatusCard';
import { useBackupManager } from '../features/settings/backup/useBackupManager';

export default function BackupManager() {
  const { settings } = useApp();
  const manager = useBackupManager();
  return (
    <div className="space-y-6">
      <BackupStatusCard config={manager.config} dataSize={manager.dataSize} schedulerActive={manager.schedulerActive} />
      <BackupActions isRunning={manager.isRunning} handleManualBackup={manager.handleManualBackup}
        handleRestoreFromFile={manager.handleRestoreFromFile} handleRestoreFromLocal={manager.handleRestoreFromLocal} />
      <BackupPreferencesForm preferences={manager.preferences} setPreferences={manager.setPreferences}
        schedulerActive={manager.schedulerActive} handleToggleScheduler={manager.handleToggleScheduler}
        handleSaveConfig={manager.handleSaveConfig} primaryColor={settings?.primaryColor || '#6366f1'} />
      <BackupHistoryList history={manager.history} onClear={manager.handleClearHistory} />
      {manager.confirmDialog}
    </div>
  );
}
