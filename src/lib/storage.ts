/**
 * Cloud Sync Layer
 * طبقة المزامنة السحابية (Supabase)
 *
 * التطبيق يعمل محلياً بالكامل (IndexedDB) كمصدر الحقيقة، ويستخدم Supabase
 * كطبقة نسخ احتياطي / مزامنة اختيارية يدوية عبر أزرار "رفع للسحابة" و
 * "تنزيل من السحابة" في صفحة الإعدادات.
 */

import { getSupabaseClient, getSupabaseConfigured } from './supabase';
import * as localDB from './db';
import { notify } from './notifications';

type TableName = 'students' | 'teachers' | 'courses' | 'groups' |
                 'payments' | 'attendance' | 'users' | 'settings' |
                 'expenses' | 'exams' | 'grades' | 'inventory' | 'inventory_transactions' |
                 'enrollments';

// Convert camelCase to snake_case for Supabase
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Convert snake_case to camelCase for local
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Transform object keys
function transformKeys(obj: Record<string, unknown>, transformer: (key: string) => string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[transformer(key)] = value;
  }
  return result;
}

function isCloudReady(): boolean {
  return getSupabaseConfigured() && getSupabaseClient() !== null;
}

function getClient() {
  return getSupabaseClient();
}

// ==================== SYNC UTILITIES ====================

const SYNC_TABLES: TableName[] = [
  'students', 'teachers', 'courses', 'groups',
  'payments', 'attendance', 'expenses', 'exams', 'grades',
  'enrollments', 'inventory', 'inventory_transactions', 'users', 'settings',
];

export async function syncLocalToCloud(): Promise<void> {
  const client = getClient();
  if (!isCloudReady() || !client) {
    notify.error('Supabase غير مهيأ. يرجى إعداد الاتصال من صفحة الإعدادات.');
    return;
  }

  const loadingToast = notify.loading('جاري المزامنة مع السحابة...');

  try {
    for (const table of SYNC_TABLES) {
      const localData = await localDB.dbGetAll(table);
      if (localData.length > 0) {
        const transformed = localData.map(item =>
          transformKeys(item as Record<string, unknown>, toSnakeCase)
        );
        const { error } = await client.from(table).upsert(transformed);
        if (error) console.error(`Sync ${table} error:`, error);
      }
    }
    notify.dismiss(loadingToast);
    notify.success('تم المزامنة بنجاح');
  } catch (e) {
    notify.dismiss(loadingToast);
    notify.error('فشلت المزامنة');
    console.error('Sync error:', e);
  }
}

export async function syncCloudToLocal(): Promise<void> {
  const client = getClient();
  if (!isCloudReady() || !client) {
    notify.error('Supabase غير مهيأ. يرجى إعداد الاتصال من صفحة الإعدادات.');
    return;
  }

  const loadingToast = notify.loading('جاري تنزيل البيانات من السحابة...');

  try {
    for (const table of SYNC_TABLES) {
      const { data, error } = await client.from(table).select('*');
      if (error) {
        console.error(`Download ${table} error:`, error);
        continue;
      }
      if (data && data.length > 0) {
        await localDB.dbClearStore(table);
        const transformed = data.map(item =>
          transformKeys(item, toCamelCase)
        );
        await localDB.dbBulkAdd(table, transformed);
      }
    }
    notify.dismiss(loadingToast);
    notify.success('تم تنزيل البيانات بنجاح');
  } catch (e) {
    notify.dismiss(loadingToast);
    notify.error('فشل التنزيل');
    console.error('Download error:', e);
  }
}
