// ==================== SUPABASE CONFIG ====================
// التهيئة تتم عبر متغيرات البيئة أو من واجهة الإعدادات

export const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const STORAGE_KEY_URL = 'educenter_supabase_url';

export const STORAGE_KEY_KEY = 'educenter_supabase_key';

/** اعتماد حساب المركز في السحابة (حساب Supabase Auth واحد لكل مركز = tenant) */
export const STORAGE_KEY_EMAIL = 'educenter_supabase_email';

export const STORAGE_KEY_PASSWORD = 'educenter_supabase_password';

// Get config from localStorage (set via Settings UI) or env vars
export function getSupabaseUrl(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_URL);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    /* ignore */
  }
  return ENV_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    /* ignore */
  }
  return ENV_SUPABASE_ANON_KEY;
}

// ==================== DYNAMIC CONFIG ====================

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_KEY, anonKey);
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_KEY);
}

export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  return {
    url: localStorage.getItem(STORAGE_KEY_URL) || ENV_SUPABASE_URL || '',
    anonKey: localStorage.getItem(STORAGE_KEY_KEY) || ENV_SUPABASE_ANON_KEY || '',
  };
}

// ---- اعتماد حساب المركز (tenant) في السحابة ----
// التطبيق local-first؛ السحابة نسخة احتياطية/مزامنة لكل مركز. حساب المركز
// الواحد في Supabase Auth هو الـ tenant: كل صف متاح لصاحبه فقط (RLS).

export function saveCloudCredentials(email: string, password: string): void {
  try {
    if (email) localStorage.setItem(STORAGE_KEY_EMAIL, email.trim());
    if (password) localStorage.setItem(STORAGE_KEY_PASSWORD, password);
  } catch {
    /* ignore */
  }
}

export function getCloudCredentials(): { email: string; password: string } {
  return {
    email: (localStorage.getItem(STORAGE_KEY_EMAIL) || '').trim(),
    password: localStorage.getItem(STORAGE_KEY_PASSWORD) || '',
  };
}

export function clearCloudCredentials(): void {
  localStorage.removeItem(STORAGE_KEY_EMAIL);
  localStorage.removeItem(STORAGE_KEY_PASSWORD);
}
