import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './config';

// Dynamic state
let _supabaseUrl = getSupabaseUrl();

let _supabaseAnonKey = getSupabaseAnonKey();

let _client: SupabaseClient | null = null;

let _isConfigured = Boolean(_supabaseUrl && _supabaseAnonKey);

if (_isConfigured) _client = createClient(_supabaseUrl!, _supabaseAnonKey!);

export function getSupabaseConfigured(): boolean {
  return _isConfigured;
}

export function getSupabaseClient(): SupabaseClient | null {
  return _client;
}

// Re-export for backward compatibility
export const isSupabaseConfigured = _isConfigured;

export const supabase: SupabaseClient | null = _client;

/**
 * إعادة تهيئة عميل Supabase بعد تغيير الإعدادات
 * يتطلب إعادة تحميل الصفحة لتطبيق التغييرات
 */
export function reinitializeSupabase(url: string, anonKey: string): boolean {
  try {
    if (!url || !anonKey) return false;
    const testClient = createClient(url, anonKey);
    _client = testClient;
    _supabaseUrl = url;
    _supabaseAnonKey = anonKey;
    _isConfigured = true;
    return true;
  } catch {
    return false;
  }
}
