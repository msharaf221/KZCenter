import { createClient, SupabaseClient } from '@supabase/supabase-js';
import schemaSql from '../../supabase_schema.sql?raw';

// ==================== SUPABASE CONFIG ====================
// التهيئة تتم عبر متغيرات البيئة أو من واجهة الإعدادات

const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const STORAGE_KEY_URL = 'educenter_supabase_url';
const STORAGE_KEY_KEY = 'educenter_supabase_key';

// Get config from localStorage (set via Settings UI) or env vars
function getSupabaseUrl(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_URL);
    if (stored && stored.trim()) return stored.trim();
  } catch { /* ignore */ }
  return ENV_SUPABASE_URL;
}

function getSupabaseAnonKey(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch { /* ignore */ }
  return ENV_SUPABASE_ANON_KEY;
}

// Dynamic state
let _supabaseUrl = getSupabaseUrl();
let _supabaseAnonKey = getSupabaseAnonKey();
let _client: SupabaseClient | null = null;
let _isConfigured = Boolean(_supabaseUrl && _supabaseAnonKey);

if (_isConfigured) {
  _client = createClient(_supabaseUrl!, _supabaseAnonKey!);
}

export function getSupabaseConfigured(): boolean {
  return _isConfigured;
}

export function getSupabaseClient(): SupabaseClient | null {
  return _client;
}

// Re-export for backward compatibility
export const isSupabaseConfigured = _isConfigured;
export const supabase: SupabaseClient | null = _client;

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

// ==================== DATABASE TYPES ====================

export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
          id: string;
          name: string;
          age: number;
          gender: 'male' | 'female';
          phone: string | null;
          parent_phone: string;
          avatar: string | null;
          notes: string | null;
          status: 'active' | 'suspended' | 'ended';
          total_paid: number;
          total_owed: number;
          enrolled_groups: string[];
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['students']['Insert']>;
      };
      teachers: {
        Row: {
          id: string;
          name: string;
          specialization: string;
          phone: string;
          email: string | null;
          salary: number;
          status: 'active' | 'vacation' | 'suspended';
          avatar: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['teachers']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['teachers']['Insert']>;
      };
      courses: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string | null;
          price: number;
          duration_months: number;
          icon: string;
          color: string;
          levels: object[];
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['courses']['Insert']>;
      };
      groups: {
        Row: {
          id: string;
          name: string;
          course_id: string;
          level_id: string | null;
          teacher_id: string;
          schedule: object[];
          max_students: number;
          status: 'open' | 'full' | 'ended';
          student_ids: string[];
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['groups']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['groups']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          student_id: string;
          course_id: string | null;
          amount: number;
          type: 'subscription' | 'books' | 'other';
          status: 'paid' | 'pending' | 'late';
          date: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };
      attendance: {
        Row: {
          id: string;
          student_id: string;
          group_id: string;
          date: string;
          status: 'present' | 'absent' | 'late' | 'excused';
          check_in_time: string | null;
          check_out_time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['attendance']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['attendance']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          username: string;
          password_hash: string;
          role: 'admin' | 'teacher';
          teacher_id: string | null;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      settings: {
        Row: {
          id: string;
          center_name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          academic_year: string | null;
          currency: string;
          primary_color: string;
          font_size: 'sm' | 'md' | 'lg';
          dark_mode: boolean;
          notify_new_student: boolean;
          notify_absence: boolean;
          notify_late_payment: boolean;
        };
        Insert: Database['public']['Tables']['settings']['Row'];
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
      };
      expenses: {
        Row: {
          id: string;
          category: 'salaries' | 'bills' | 'maintenance' | 'purchases' | 'rent' | 'other';
          amount: number;
          description: string;
          date: string;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
      };
      exams: {
        Row: {
          id: string;
          name: string;
          group_id: string;
          date: string;
          max_grade: number;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['exams']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['exams']['Insert']>;
      };
      grades: {
        Row: {
          id: string;
          exam_id: string;
          student_id: string;
          grade: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['grades']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['grades']['Insert']>;
      };
      inventory: {
        Row: {
          id: string;
          name: string;
          type: 'book' | 'handout' | 'other';
          cost_price: number;
          sell_price: number;
          stock: number;
          course_id: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>;
      };
      inventory_transactions: {
        Row: {
          id: string;
          item_id: string;
          type: 'in' | 'out';
          quantity: number;
          price: number;
          student_id: string | null;
          date: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['inventory_transactions']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['inventory_transactions']['Insert']>;
      };
    };
  };
}

// ==================== SQL SCHEMA ====================
// يتم تحميل الـ Schema من ملف supabase_schema.sql (مصدر واحد للحقيقة)
// عشان نضمن إن زر "نسخ الـ Schema" في الإعدادات بيطابق الملف الفعلي.
export const SQL_SCHEMA: string = schemaSql;

// ==================== CLOUD SESSION ====================
/**
 * سياسات RLS في supabase_schema.sql بترفض دور `anon` تماماً (وده مقصود:
 * الـ anon key مبني في كود العميل فأي حد يقدر يستخدمه). عشان كده التطبيق لازم
 * يعمل Supabase session قبل أي مزامنة — بنستخدم **Anonymous Sign-In**.
 *
 * المطلوب تفعيله في Supabase Dashboard:
 *   Authentication → Sign In / Up → Anonymous Sign-Ins → ON
 */
export interface CloudSessionResult {
  ok: boolean;
  error?: string;
  /** هل الجلسة anonymous (مش مستخدم مسجّل في Supabase Auth) */
  anonymous?: boolean;
}

let sessionPromise: Promise<CloudSessionResult> | null = null;

export async function ensureCloudSession(force = false): Promise<CloudSessionResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase غير مهيأ — أضف الـ URL والـ anon key من الإعدادات.' };
  }

  // منع تكرار محاولات متوازية (كل عملية مزامنة بتستدعي الدالة دي)
  if (!force && sessionPromise) return sessionPromise;

  sessionPromise = (async (): Promise<CloudSessionResult> => {
    try {
      const { data } = await client.auth.getSession();
      if (data?.session) {
        return { ok: true, anonymous: !data.session.user?.email };
      }

      const { data: signed, error } = await client.auth.signInAnonymously();
      if (error || !signed?.session) {
        return {
          ok: false,
          error:
            'فشل إنشاء جلسة سحابية. فعّل Anonymous Sign-Ins من ' +
            'Supabase Dashboard → Authentication → Sign In / Up، وتأكد إنك شغّلت ' +
            'أحدث نسخة من supabase_schema.sql (السياسات بترفض دور anon). ' +
            (error?.message ? `(${error.message})` : ''),
        };
      }
      return { ok: true, anonymous: true };
    } catch (e) {
      return { ok: false, error: `تعذّر الاتصال بـ Supabase: ${String(e)}` };
    } finally {
      // نسيب الوعد شوية عشان الطلبات المتزامنة تشترك فيه، ثم نُفرغه
      setTimeout(() => { sessionPromise = null; }, 2000);
    }
  })();

  return sessionPromise;
}

// ==================== CONNECTION TEST ====================

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
  /** عدد الصفوف المقروءة من جدول الإعدادات (دليل إن RLS بتسمح بالقراءة) */
  readable?: boolean;
}

/** اختبار اتصال مفصّل: جلسة + قراءة فعلية (بتكشف مشاكل RLS) */
export async function testSupabaseConnectionDetailed(): Promise<ConnectionTestResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase غير مهيأ.' };

  const session = await ensureCloudSession(true);
  if (!session.ok) return { ok: false, error: session.error };

  try {
    const { error } = await client.from('settings').select('id').limit(1);
    if (error) {
      return {
        ok: false,
        readable: false,
        error:
          'الجلسة اتعملت لكن القراءة مرفوضة — غالباً RLS. تأكد إنك شغّلت ' +
          `أحدث نسخة من supabase_schema.sql. (${error.message})`,
      };
    }
    return { ok: true, readable: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** اختبار الاتصال (متوافق مع الاستخدام القديم) */
export async function testSupabaseConnection(): Promise<boolean> {
  return (await testSupabaseConnectionDetailed()).ok;
}
