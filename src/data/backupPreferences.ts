import {
  backupPreferences, normalizeBackupConfig, normalizeBackupHistory, validateBackupPreferences,
  type BackupConfig, type BackupHistory, type BackupLogEntry, type BackupPreferences,
} from '../domain/backup/settings';

export const BACKUP_CONFIG_KEY = 'educenter_backup_config';
export const BACKUP_HISTORY_KEY = 'educenter_backup_history';
let revision = 0;
const listeners = new Set<() => void>();
function publish() { revision++; listeners.forEach(listener => listener()); }
function onStorage(event: StorageEvent) {
  if (!event.key || event.key === BACKUP_CONFIG_KEY || event.key === BACKUP_HISTORY_KEY) publish();
}
export function subscribeBackupPreferences(listener: () => void): () => void {
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}
export const getBackupPreferencesRevision = () => revision;
function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
  publish();
}
export const getBackupConfig = (): BackupConfig => normalizeBackupConfig(read(BACKUP_CONFIG_KEY));
export function saveBackupConfig(patch: Partial<BackupConfig>): void {
  write(BACKUP_CONFIG_KEY, normalizeBackupConfig({ ...getBackupConfig(), ...patch }));
}
/** User drafts own preferences only, never runtime counters/timestamps copied when the form opened. */
export function saveBackupPreferences(preferences: BackupPreferences): void {
  validateBackupPreferences(preferences);
  saveBackupConfig(backupPreferences(preferences));
}
export const getBackupHistory = (): BackupHistory => normalizeBackupHistory(read(BACKUP_HISTORY_KEY));
export function addBackupLog(entry: BackupLogEntry): void {
  write(BACKUP_HISTORY_KEY, normalizeBackupHistory({ logs: [entry, ...getBackupHistory().logs] }));
}
export function clearBackupHistory(): void { write(BACKUP_HISTORY_KEY, { logs: [] }); }
