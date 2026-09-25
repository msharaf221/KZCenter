import { getSupabaseClient } from '../../data/cloud/client';
import { ensureCloudSession } from './session';

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
