import { requireRule } from '../errors';

export type BackupDestination = 'local' | 'cloud' | 'both';
export type BackupStatus = 'idle' | 'running' | 'success' | 'error';
export interface BackupPreferences {
  enabled: boolean;
  destination: BackupDestination;
  time: string;
  keepDays: number;
}
export interface BackupConfig extends BackupPreferences {
  lastBackupDate: string | null;
  lastBackupStatus: BackupStatus;
  lastBackupError: string | null;
  totalBackups: number;
}
export interface BackupLogEntry {
  id: string;
  date: string;
  destination: BackupDestination;
  status: 'success' | 'error';
  size: number;
  duration: number;
  error?: string;
}
export interface BackupHistory { logs: BackupLogEntry[] }
export interface BackupResult { success: boolean; error?: string; warning?: string }
export interface BackupTransferResult extends BackupResult { size: number }

const DEFAULT_CONFIG: Readonly<BackupConfig> = {
  enabled: true, destination: 'both', time: '02:00', keepDays: 30,
  lastBackupDate: null, lastBackupStatus: 'idle', lastBackupError: null, totalBackups: 0,
};
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(new Date(value).getTime());
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const isBackupDestination = (value: unknown): value is BackupDestination => value === 'local' || value === 'cloud' || value === 'both';

export function normalizeBackupConfig(input: unknown): BackupConfig {
  const value = record(input);
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_CONFIG.enabled,
    destination: isBackupDestination(value.destination) ? value.destination : DEFAULT_CONFIG.destination,
    time: typeof value.time === 'string' && timePattern.test(value.time) ? value.time : DEFAULT_CONFIG.time,
    keepDays: isCount(value.keepDays) && value.keepDays >= 1 && value.keepDays <= 365 ? value.keepDays : DEFAULT_CONFIG.keepDays,
    lastBackupDate: isTimestamp(value.lastBackupDate) ? value.lastBackupDate : null,
    lastBackupStatus: typeof value.lastBackupStatus === 'string' && ['idle', 'running', 'success', 'error'].includes(value.lastBackupStatus) ? value.lastBackupStatus as BackupStatus : 'idle',
    lastBackupError: typeof value.lastBackupError === 'string' ? value.lastBackupError : null,
    totalBackups: isCount(value.totalBackups) ? value.totalBackups : 0,
  };
}

export function backupPreferences(config: BackupPreferences): BackupPreferences {
  return { enabled: config.enabled, destination: config.destination, time: config.time, keepDays: config.keepDays };
}
export function validateBackupPreferences(value: BackupPreferences): void {
  requireRule(typeof value.enabled === 'boolean', 'اختر حالة النسخ التلقائي');
  requireRule(isBackupDestination(value.destination), 'اختر وجهة صحيحة للنسخ الاحتياطي');
  requireRule(typeof value.time === 'string' && timePattern.test(value.time), 'اختر وقتاً صحيحاً للنسخ الاحتياطي');
  requireRule(isCount(value.keepDays) && value.keepDays >= 1 && value.keepDays <= 365, 'مدة الاحتفاظ يجب أن تكون بين يوم و365 يوماً');
}

export function normalizeBackupHistory(input: unknown): BackupHistory {
  const value = record(input);
  if (!Array.isArray(value.logs)) return { logs: [] };
  const logs: BackupLogEntry[] = [];
  for (const input of value.logs) {
    const entry = record(input);
    if (typeof entry.id !== 'string' || !entry.id || !isTimestamp(entry.date) || !isBackupDestination(entry.destination)
      || (entry.status !== 'success' && entry.status !== 'error') || !isAmount(entry.size) || !isAmount(entry.duration)) continue;
    logs.push({ id: entry.id, date: entry.date, destination: entry.destination, status: entry.status, size: entry.size, duration: entry.duration,
      ...(typeof entry.error === 'string' ? { error: entry.error } : {}),
    });
    if (logs.length === 100) break;
  }
  return { logs };
}

export function formatBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
