/**
 * Unified Storage Layer
 * يدعم IndexedDB (محلي) و Supabase (سحابي)
 * يتم اختيار المخزن تلقائياً بناءً على التهيئة
 */

import { getSupabaseClient, getSupabaseConfigured } from './supabase';
import * as localDB from './db';
import { notify } from './notifications';

// Storage mode
export type StorageMode = 'local' | 'cloud' | 'hybrid';

let currentMode: StorageMode = getSupabaseConfigured() ? 'cloud' : 'local';

export function getStorageMode(): StorageMode {
  return currentMode;
}

export function setStorageMode(mode: StorageMode) {
  currentMode = mode;
}

// Helper to check if cloud is available
function isCloudReady(): boolean {
  return getSupabaseConfigured() && getSupabaseClient() !== null;
}

function getClient() {
  return getSupabaseClient();
}

// ==================== GENERIC OPERATIONS ====================

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

// ==================== CLOUD OPERATIONS ====================

async function cloudGetAll<T>(table: TableName): Promise<T[]> {
  const client = getClient();
  if (!client) return [];
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('deleted', false)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error(`Cloud getAll(${table}) error:`, error);
    notify.error(`خطأ في جلب البيانات من ${table}`);
    return [];
  }
  
  return (data || []).map(item => transformKeys(item, toCamelCase) as T);
}

async function cloudGetById<T>(table: TableName, id: string): Promise<T | undefined> {
  const client = getClient();
  if (!client) return undefined;
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error(`Cloud getById(${table}) error:`, error);
    return undefined;
  }
  
  return data ? transformKeys(data, toCamelCase) as T : undefined;
}

async function cloudAdd<T extends Record<string, unknown>>(table: TableName, item: T): Promise<void> {
  const client = getClient();
  if (!client) return;
  const transformed = transformKeys(item, toSnakeCase);
  const { error } = await client.from(table).insert(transformed);
  
  if (error) {
    console.error(`Cloud add(${table}) error:`, error);
    throw error;
  }
}

async function cloudUpdate<T extends Record<string, unknown>>(table: TableName, item: T): Promise<void> {
  const client = getClient();
  if (!client) return;
  const transformed = transformKeys(item, toSnakeCase);
  const id = transformed.id as string;
  delete transformed.id;
  
  const { error } = await client
    .from(table)
    .update({ ...transformed, updated_at: new Date().toISOString() })
    .eq('id', id);
  
  if (error) {
    console.error(`Cloud update(${table}) error:`, error);
    throw error;
  }
}

async function cloudSoftDelete(table: TableName, id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const { error } = await client
    .from(table)
    .update({ deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  
  if (error) {
    console.error(`Cloud softDelete(${table}) error:`, error);
    throw error;
  }
}

async function cloudGetPaginated<T>(
  table: TableName,
  page: number,
  pageSize: number,
  filters?: Record<string, unknown>
): Promise<{ items: T[]; total: number }> {
  const client = getClient();
  if (!client) return { items: [], total: 0 };
  
  let query = client
    .from(table)
    .select('*', { count: 'exact' })
    .eq('deleted', false);
  
  // Apply filters
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        query = query.eq(toSnakeCase(key), value);
      }
    }
  }
  
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  
  if (error) {
    console.error(`Cloud getPaginated(${table}) error:`, error);
    return { items: [], total: 0 };
  }
  
  return {
    items: (data || []).map(item => transformKeys(item, toCamelCase) as T),
    total: count || 0,
  };
}

// ==================== UNIFIED API ====================

export const storage = {
  async getAll<T>(table: TableName): Promise<T[]> {
    if (currentMode === 'cloud' && isCloudReady()) {
      return cloudGetAll<T>(table);
    }
    return localDB.dbGetAll<T>(table);
  },

  async getById<T>(table: TableName, id: string): Promise<T | undefined> {
    if (currentMode === 'cloud' && isCloudReady()) {
      return cloudGetById<T>(table, id);
    }
    return localDB.dbGetById<T>(table, id);
  },

  async add<T extends Record<string, unknown>>(table: TableName, item: T): Promise<void> {
    if (currentMode === 'cloud' && isCloudReady()) {
      await cloudAdd(table, item);
    } else {
      await localDB.dbAdd(table, item);
    }
    
    // Sync to other storage in hybrid mode
    if (currentMode === 'hybrid') {
      try {
        if (isCloudReady()) {
          await cloudAdd(table, item);
        }
      } catch (e) {
        console.warn('Hybrid sync failed:', e);
      }
    }
  },

  async update<T extends Record<string, unknown>>(table: TableName, item: T): Promise<void> {
    if (currentMode === 'cloud' && isCloudReady()) {
      await cloudUpdate(table, item);
    } else {
      await localDB.dbPut(table, item);
    }
  },

  async softDelete(table: TableName, id: string): Promise<void> {
    if (currentMode === 'cloud' && isCloudReady()) {
      await cloudSoftDelete(table, id);
    } else {
      await localDB.dbSoftDelete(table, id);
    }
  },

  async getPaginated<T>(
    table: TableName,
    page: number,
    pageSize: number,
    filterFn?: (item: T) => boolean
  ): Promise<{ items: T[]; total: number }> {
    if (currentMode === 'cloud' && isCloudReady()) {
      return cloudGetPaginated<T>(table, page, pageSize);
    }
    return localDB.dbGetPaginated<T>(table, page, pageSize, filterFn);
  },

  async getByIndex<T>(table: TableName, indexName: string, value: IDBValidKey): Promise<T[]> {
    const client = getClient();
    if (currentMode === 'cloud' && isCloudReady() && client) {
      const column = toSnakeCase(indexName.replace('by-', ''));
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq(column, value)
        .eq('deleted', false);
      
      if (error) {
        console.error(`Cloud getByIndex error:`, error);
        return [];
      }
      return (data || []).map(item => transformKeys(item, toCamelCase) as T);
    }
    return localDB.dbGetByIndex<T>(table, indexName, value);
  },

  async bulkAdd<T extends Record<string, unknown>>(table: TableName, items: T[]): Promise<void> {
    const client = getClient();
    if (currentMode === 'cloud' && isCloudReady() && client) {
      const transformed = items.map(item => transformKeys(item, toSnakeCase));
      const { error } = await client.from(table).insert(transformed);
      if (error) throw error;
    } else {
      await localDB.dbBulkAdd(table, items);
    }
  },

  async clear(table: TableName): Promise<void> {
    const client = getClient();
    if (currentMode === 'cloud' && isCloudReady() && client) {
      const { error } = await client
        .from(table)
        .update({ deleted: true })
        .neq('deleted', true);
      if (error) throw error;
    } else {
      await localDB.dbClearStore(table);
    }
  },
};

// ==================== SYNC UTILITIES ====================

export async function syncLocalToCloud(): Promise<void> {
  const client = getClient();
  if (!isCloudReady() || !client) {
    notify.error('Supabase غير مهيأ. يرجى إعداد الاتصال من صفحة الإعدادات.');
    return;
  }

  const tables: TableName[] = [
    'students', 'teachers', 'courses', 'groups',
    'payments', 'attendance', 'expenses', 'exams', 'grades',
    'enrollments'
  ];

  const loadingToast = notify.loading('جاري المزامنة مع السحابة...');

  try {
    for (const table of tables) {
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

  const tables: TableName[] = [
    'students', 'teachers', 'courses', 'groups',
    'payments', 'attendance', 'expenses', 'exams', 'grades',
    'enrollments'
  ];

  const loadingToast = notify.loading('جاري تنزيل البيانات من السحابة...');

  try {
    for (const table of tables) {
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
