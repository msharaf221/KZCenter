/**
 * Daily Auto Backup System
 * نظام النسخ الاحتياطي اليومي التلقائي
 * يدعم الحفظ المحلي (Electron) والتخزين السحابي (Supabase)
 */

import { exportAllData, importAllData } from './db';
import { getSupabaseClient, getSupabaseConfigured } from './supabase';
import { notify } from './notifications';
import { addAuditEntry } from './security';
import { markBackupDone } from './autoBackup';

// ==================== TYPES ====================

export type BackupDestination = 'local' | 'cloud' | 'both';
export type BackupStatus = 'idle' | 'running' | 'success' | 'error';

export interface BackupConfig {
  enabled: boolean;
  destination: BackupDestination;
  time: string; // HH:mm format
  keepDays: number; // عدد الأيام للاحتفاظ بالنسخ
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
  size: number; // bytes
  duration: number; // ms
  error?: string;
}

export interface BackupHistory {
  logs: BackupLogEntry[];
}

// ==================== CONFIG ====================

const BACKUP_CONFIG_KEY = 'educenter_backup_config';
const BACKUP_HISTORY_KEY = 'educenter_backup_history';
const BACKUP_CHECK_INTERVAL = 60 * 1000; // Check every minute

const DEFAULT_CONFIG: BackupConfig = {
  enabled: true,
  destination: 'both',
  time: '02:00', // 2 AM
  keepDays: 30,
  lastBackupDate: null,
  lastBackupStatus: 'idle',
  lastBackupError: null,
  totalBackups: 0,
};

let backupTimer: ReturnType<typeof setInterval> | null = null;
let isBackingUp = false;

// ==================== CONFIG MANAGEMENT ====================

export function getBackupConfig(): BackupConfig {
  try {
    const stored = localStorage.getItem(BACKUP_CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveBackupConfig(config: Partial<BackupConfig>): void {
  const current = getBackupConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(BACKUP_CONFIG_KEY, JSON.stringify(updated));
}

// ==================== BACKUP HISTORY ====================

export function getBackupHistory(): BackupHistory {
  try {
    const stored = localStorage.getItem(BACKUP_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return { logs: [] };
  } catch {
    return { logs: [] };
  }
}

function addBackupLog(entry: BackupLogEntry): void {
  const history = getBackupHistory();
  history.logs.unshift(entry);
  // Keep last 100 entries
  if (history.logs.length > 100) {
    history.logs = history.logs.slice(0, 100);
  }
  localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
}

export function clearBackupHistory(): void {
  localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify({ logs: [] }));
}

// ==================== BACKUP EXECUTION ====================

/**
 * تنفيذ النسخ الاحتياطي المحلي (Electron)
 */
async function backupToLocal(): Promise<{ success: boolean; size: number; error?: string }> {
  try {
    const data = await exportAllData();
    const jsonString = JSON.stringify(data, null, 2);
    const size = new Blob([jsonString]).size;

    // Check if running in Electron
    if (window.electronAPI?.isElectron) {
      const result = await window.electronAPI.backup.saveLocal(jsonString);
      if (result.success) {
        return { success: true, size };
      }
      return { success: false, size, error: result.error };
    }

    // Fallback: save to download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `educenter_auto_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return { success: true, size };
  } catch (error) {
    return { success: false, size: 0, error: String(error) };
  }
}

/**
 * تنفيذ النسخ الاحتياطي السحابي (Supabase)
 */
async function backupToCloud(): Promise<{ success: boolean; size: number; error?: string }> {
  if (!getSupabaseConfigured() || !getSupabaseClient()) {
    return { success: false, size: 0, error: 'Supabase غير مهيأ. يرجى إعداد الاتصال من صفحة الإعدادات.' };
  }

  try {
    const data = await exportAllData();
    const jsonString = JSON.stringify(data);
    const size = new Blob([jsonString]).size;
    const client = getSupabaseClient()!;

    // Save backup metadata to Supabase
    const { error: metaError } = await client
      .from('backups')
      .insert({
        backup_date: new Date().toISOString(),
        size_bytes: size,
        status: 'success',
        data_snapshot: jsonString,
      });

    if (metaError) {
      // If backups table doesn't exist, just sync the data
      console.warn('Backups table not found, syncing data directly...');
    }

    // Also sync each table to Supabase
    const tables = ['students', 'teachers', 'courses', 'groups', 'payments', 
                    'attendance', 'expenses', 'exams', 'grades', 'enrollments',
                    'inventory', 'inventory_transactions', 'users'];

    for (const table of tables) {
      // exportAllData uses camelCase keys (e.g. `inventoryTransactions`)
      const dataKey = table === 'inventory_transactions' ? 'inventoryTransactions' : table;
      const tableData = (data as Record<string, unknown>)[dataKey];
      if (Array.isArray(tableData) && tableData.length > 0) {
        // Convert camelCase to snake_case for Supabase
        const transformed = tableData.map(item => {
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            result[snakeKey] = value;
          }
          return result;
        });

        const { error } = await client
          .from(table)
          .upsert(transformed, { onConflict: 'id' });

        if (error) {
          console.error(`Failed to sync ${table}:`, error);
        }
      }
    }

    return { success: true, size };
  } catch (error) {
    return { success: false, size: 0, error: String(error) };
  }
}

/**
 * تنفيذ النسخ الاحتياطي الكامل
 */
export async function executeBackup(
  destination?: BackupDestination,
  showNotification = true
): Promise<{ success: boolean; error?: string }> {
  if (isBackingUp) {
    return { success: false, error: 'النسخ الاحتياطي قيد التنفيذ بالفعل' };
  }

  isBackingUp = true;
  const config = getBackupConfig();
  const dest = destination || config.destination;
  const startTime = Date.now();

  try {
    if (showNotification) {
      notify.loading('جاري النسخ الاحتياطي...');
    }

    let totalSize = 0;
    let allSuccess = true;
    let lastError = '';

    // Local backup
    if (dest === 'local' || dest === 'both') {
      const localResult = await backupToLocal();
      if (localResult.success) {
        totalSize += localResult.size;
      } else {
        allSuccess = false;
        lastError = `محلي: ${localResult.error}`;
      }
    }

    // Cloud backup
    if (dest === 'cloud' || dest === 'both') {
      const cloudResult = await backupToCloud();
      if (cloudResult.success) {
        totalSize += cloudResult.size;
      } else {
        allSuccess = false;
        lastError = `سحابي: ${cloudResult.error}`;
      }
    }

    const duration = Date.now() - startTime;

    // Log the backup
    addBackupLog({
      id: crypto.randomUUID?.() || Date.now().toString(36),
      date: new Date().toISOString(),
      destination: dest,
      status: allSuccess ? 'success' : 'error',
      size: totalSize,
      duration,
      error: allSuccess ? undefined : lastError,
    });

    // Update config
    saveBackupConfig({
      lastBackupDate: new Date().toISOString(),
      lastBackupStatus: allSuccess ? 'success' : 'error',
      lastBackupError: allSuccess ? null : lastError,
      totalBackups: config.totalBackups + (allSuccess ? 1 : 0),
    });

    // Audit log
    addAuditEntry({
      userId: 'system',
      username: 'نظام النسخ الاحتياطي',
      action: 'backup',
      entity: 'backup',
      details: `نسخ احتياطي ${allSuccess ? 'ناجح' : 'فاشل'} - الوجهة: ${dest} - الحجم: ${formatSize(totalSize)} - المدة: ${duration}ms`,
    });

    if (showNotification) {
      notify.dismiss();
      if (allSuccess) {
        notify.success(`تم النسخ الاحتياطي بنجاح (${formatSize(totalSize)})`);
      } else {
        notify.error(`فشل النسخ الاحتياطي: ${lastError}`);
      }
    }

    // Keep the dashboard reminder in sync with successful daily/manual backups.
    if (allSuccess) {
      markBackupDone();
    }

    return { success: allSuccess, error: allSuccess ? undefined : lastError };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    addBackupLog({
      id: crypto.randomUUID?.() || Date.now().toString(36),
      date: new Date().toISOString(),
      destination: dest,
      status: 'error',
      size: 0,
      duration,
      error: String(error),
    });

    saveBackupConfig({
      lastBackupDate: new Date().toISOString(),
      lastBackupStatus: 'error',
      lastBackupError: String(error),
    });

    if (showNotification) {
      notify.dismiss();
      notify.error('حدث خطأ أثناء النسخ الاحتياطي');
    }

    return { success: false, error: String(error) };
  } finally {
    isBackingUp = false;
  }
}

// ==================== SCHEDULER ====================

/**
 * بدء المجدول التلقائي للنسخ الاحتياطي
 */
export function startBackupScheduler(): void {
  stopBackupScheduler();

  // Check every minute
  backupTimer = setInterval(() => {
    const config = getBackupConfig();
    if (!config.enabled) return;

    const now = new Date();
    const [targetHour, targetMinute] = config.time.split(':').map(Number);

    if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
      // Check if we already backed up today
      const today = now.toISOString().split('T')[0];
      const lastDate = config.lastBackupDate?.split('T')[0];

      if (lastDate !== today) {
        console.log('Executing scheduled backup...');
        executeBackup(config.destination, true);
      }
    }
  }, BACKUP_CHECK_INTERVAL);

  console.log('Backup scheduler started');
}

/**
 * إيقاف المجدول
 */
export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

/**
 * فحص إذا كان النسخ الاحتياطي متأخر
 */
export function isBackupOverdue(): boolean {
  const config = getBackupConfig();
  if (!config.enabled) return false;
  if (!config.lastBackupDate) return true;

  const lastBackup = new Date(config.lastBackupDate);
  const now = new Date();
  const hoursSinceLastBackup = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60);

  return hoursSinceLastBackup > 24;
}

// ==================== RESTORE ====================

/**
 * استعادة نسخة احتياطية
 */
export async function restoreBackup(source: 'local' | 'file', fileContent?: string): Promise<boolean> {
  try {
    let data: string | undefined;

    if (source === 'local' && window.electronAPI?.isElectron) {
      const result = await window.electronAPI.backup.restoreLocal();
      if (!result.success || !result.data) {
        notify.error(result.error || 'فشل في قراءة النسخة الاحتياطية');
        return false;
      }
      data = result.data;
    } else if (fileContent) {
      data = fileContent;
    }

    if (!data) {
      notify.error('لم يتم اختيار ملف');
      return false;
    }

    const parsed = JSON.parse(data);

    // Validate backup structure
    const requiredFields = ['students', 'teachers', 'courses', 'groups'];
    for (const field of requiredFields) {
      if (!(field in parsed)) {
        notify.error('ملف النسخة الاحتياطية غير صالح');
        return false;
      }
    }

    await importAllData(parsed);

    addAuditEntry({
      userId: 'system',
      username: 'نظام النسخ الاحتياطي',
      action: 'import',
      entity: 'backup',
      details: `استعادة نسخة احتياطية من ${source === 'local' ? 'الجهاز' : 'ملف'}`,
    });

    notify.success('تم استعادة النسخة الاحتياطية بنجاح');
    return true;
  } catch (error) {
    console.error('Restore failed:', error);
    notify.error('فشل في استعادة النسخة الاحتياطية');
    return false;
  }
}

// ==================== HELPERS ====================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * جلب حجم البيانات الحالية
 */
export async function getDataSize(): Promise<string> {
  try {
    const data = await exportAllData();
    const jsonString = JSON.stringify(data);
    return formatSize(new Blob([jsonString]).size);
  } catch {
    return 'غير معروف';
  }
}
