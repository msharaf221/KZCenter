import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../data/cloud/client';
import { getCloudCredentials } from '../../data/cloud/config';

// ==================== CLOUD SESSION ====================
/**
 * سياسات RLS في supabase_schema.sql (قسم «عزل المستأجرين») بترفض دور `anon`
 * تماماً، وكل صف متاح فقط لصاحبه (`tenant_id = auth.uid()`). عشان كده
 * التطبيق لازم يعمل **تسجيل دخول بحساب المركز** (بريد + كلمة مرور) في Supabase
 * قبل أي مزامنة.
 *
 * المطلوب في Supabase Dashboard (مرة واحدة):
 *   1) Authentication → Providers → Email → ON.
 *   2) اعمل مستخدم واحد للمركز (Add user) بالبريد وكلمة المرور.
 *   3) شغّل أحدث supabase_schema.sql (قسم عزل المستأجرين).
 */
export interface CloudSessionResult {
  ok: boolean;
  error?: string;
}

const sessions = new WeakMap<SupabaseClient, Promise<CloudSessionResult>>();

export function ensureCloudSession(force = false): Promise<CloudSessionResult> {
  return ensureSessionForClient(getSupabaseClient(), force);
}

export async function ensureSessionForClient(
  client: SupabaseClient | null,
  force = false,
): Promise<CloudSessionResult> {
  if (!client) {
    return { ok: false, error: 'Supabase غير مهيأ — أضف الـ URL والـ anon key من الإعدادات.' };
  }

  // منع تكرار محاولات متوازية (كل عملية مزامنة بتستدعي الدالة دي)
  const existing = sessions.get(client);
  if (!force && existing) return existing;

  const work = (async (): Promise<CloudSessionResult> => {
    try {
      // جلسة قائمة ومصادَق عليها من قبل؟
      const { data } = await client.auth.getSession();
      if (data?.session?.user?.id) {
        return { ok: true };
      }

      // تسجيل دخول بحساب المركز
      const { email, password } = getCloudCredentials();
      if (!email || !password) {
        return {
          ok: false,
          error:
            'ضع بريد وكلمة مرور حساب المركز السحابي في الإعدادات → التخزين السحابي. ' +
            'الأنظمة الحديثة تعزل بيانات كل مركز بحساب مستقل (Supabase Auth).',
        };
      }

      const { data: signed, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !signed?.session) {
        return {
          ok: false,
          error:
            'فشل تسجيل الدخول للسحابة. تأكد من بريد/كلمة مرور حساب المركز، وتفعيل ' +
            'Email في Supabase Auth، وتشغيل أحدث supabase_schema.sql. ' +
            (error?.message ? `(${error.message})` : ''),
        };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `تعذّر الاتصال بـ Supabase: ${String(e)}` };
    } finally {
      // نسيب الوعد شوية عشان الطلبات المتزامنة تشترك فيه، ثم نُفرغه
      setTimeout(() => {
        if (sessions.get(client) === work) sessions.delete(client);
      }, 2000);
    }
  })();

  sessions.set(client, work);
  return work;
}

/** تسجيل خروج من السحابة (لا يمسّ البيانات المحلية) */
export async function cloudSignOut(): Promise<void> {
  const client = getSupabaseClient();
  if (client) sessions.delete(client);
  try {
    await client?.auth.signOut();
  } catch {
    /* ignore */
  }
}
