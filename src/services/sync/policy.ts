import type { TableName } from '../../data/stores';
import { CLOUD_TABLES } from '../../data/stores';

/**
 * مفتاح التعارض (ON CONFLICT) لكل جدول عند الـ upsert.
 * جداول singleton (مفتاحها ثابت مثل 'main' لكل مركز) تحتاج عمود المستأجر في
 * المفتاح المركّب لأن id لوحده لا يعود فريداً عبر المستأجرين.
 */
// الجداول اللي مفتاحها الأساسي مركّب (id, tenant_id) في السحابة (المعزولة
// بعمود مستأجِر والمُنشأة حديثاً) تحتاج عمود المستأجِر في هدف التعارض، لأن
// id لوحده يتكرر عبر المستأجرين/المراكز. الجداول القديمة مفتاحها id (UUID) فريد.
export const CONFLICT_TARGET: Record<string, string> = {
  settings: 'id,tenant_id',
  counters: 'id,tenant_id',
  payroll: 'id,tenant_id',
  teacher_advances: 'id,tenant_id',
  refunds: 'id,tenant_id',
  cashbox_sessions: 'id,tenant_id',
  message_templates: 'id,tenant_id',
  message_logs: 'id,tenant_id',
  waitlist: 'id,tenant_id',
  audit_logs: 'id,tenant_id',
};

/** حجم الدفعة في الـ upsert (تجنّب طلبات ضخمة) */
export const UPSERT_BATCH = 400;

/** حد الصفوف في الطلب الواحد عند القراءة من Supabase */
export const PAGE_SIZE = 1000;

/** هل الجدول بيتزامن؟ (للاختبارات ولواجهة الإعدادات) */
export function isTableSynced(table: string): boolean {
  return CLOUD_TABLES.includes(table as TableName);
}
