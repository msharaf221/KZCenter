/**
 * Cloud Sync Layer — مزامنة سحابية آمنة (Supabase)
 *
 * التطبيق local-first (IndexedDB مصدر الحقيقة)، وSupabase طبقة نسخ/مزامنة اختيارية.
 *
 * الإصلاحات في النسخة دي (كان فيه 3 مشاكل خطيرة):
 *  1) **الـ pull كان مدمّر**: `dbClearStore` + إعادة كتابة → أي جهاز بيسحب نسخة أقدم
 *     كان بيمسح شغل الجهاز التاني. دلوقتي المزامنة **على مستوى الصف** بمقارنة
 *     `updatedAt` (last-write-wins) ومن غير أي مسح.
 *  2) **جدول `installments` (الأقساط/المديونيات) ما كانش بيتزامن أصلاً**، ولا
 *     `settings` ولا `audit_logs` — يعني أهم دفتر مالي ما لوش نسخة سحابية.
 *  3) **جدول `users` كان بيترفع للسحابة ومعه `password_hash`**، ومع سياسات RLS
 *     المفتوحة كان أي حد يقدر يسحب هاشات كلمات المرور. دلوقتي `users` ممنوع
 *     من المزامنة نهائياً (وأي حقل حساس بيتشال دفاعياً).
 *
 *  كمان: الـ select بقى **مُرقّم (paginated)** — Supabase بيرجّع 1000 صف كحد أقصى
 *  في الطلب الواحد، فلو الجدول أكبر كان بيحصل **اقتطاع صامت** للبيانات.
 */

import { ensureCloudSession, getSupabaseClient, getSupabaseConfigured } from './supabase';
import * as localDB from './db';
import { notify } from './notifications';

/** كل المتاجر المحلية */
export type TableName =
  | 'students' | 'teachers' | 'courses' | 'groups'
  | 'payments' | 'attendance' | 'settings'
  | 'expenses' | 'exams' | 'grades' | 'inventory' | 'inventory_transactions'
  | 'enrollments' | 'installments' | 'refunds' | 'cashbox_sessions'
  | 'payroll' | 'teacher_advances' | 'message_logs' | 'message_templates'
  | 'waitlist' | 'audit_logs' | 'counters';

/**
 * الجداول اللي بتتزامن.
 * ⚠️ `users` **مستثنى عمداً**: فيه password hashes لمستخدمين محليين، ومفيش أي
 * سبب يخليه في السحابة. لو محتاج مستخدمين سحابيين استخدم Supabase Auth.
 */
export const CLOUD_TABLES: TableName[] = [
  'students', 'teachers', 'courses', 'groups',
  'payments', 'attendance', 'expenses', 'exams', 'grades',
  'enrollments', 'installments', 'refunds',
  'inventory', 'inventory_transactions',
  'payroll', 'teacher_advances', 'cashbox_sessions',
  'message_templates', 'message_logs', 'waitlist',
  'audit_logs', 'counters', 'settings',
];

/** ممنوع من المزامنة (بيانات اعتماد) */
export const NEVER_SYNC_TABLES = ['users'] as const;

/** حقول حساسة بتتشال من أي صف قبل الرفع (دفاع في العمق) */
export const SENSITIVE_FIELDS = [
  'passwordHash', 'password_hash', 'password', 'token', 'secret', 'apiKey', 'api_key',
];

/** حجم الدفعة في الـ upsert (تجنّب طلبات ضخمة) */
export const UPSERT_BATCH = 400;
/** حد الصفوف في الطلب الواحد عند القراءة من Supabase */
export const PAGE_SIZE = 1000;

// ==================== KEY TRANSFORMS ====================

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function transformKeys(
  obj: Record<string, unknown>,
  transformer: (key: string) => string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[transformer(key)] = value;
  }
  return result;
}

/** يشيل الحقول الحساسة من صف قبل رفعه */
export function stripSensitive(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_FIELDS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

// ==================== ROW MERGE (pure) ====================

export type MergeDecision = 'insert' | 'update' | 'skip';

/**
 * قرار دمج صف سحابي مع المحلي:
 *  - مفيش محلي → insert
 *  - السحابي أحدث (updatedAt/created_at) → update
 *  - المحلي أحدث أو مساوي → skip (ما ندمّرش شغل الجهاز ده)
 *
 * ملاحظة: صفوف من غير updatedAt (زي `settings` و`counters`) بتعتبر السحابة
 * مرجّحة لو المحلي فاضي، وإلا بنسيب المحلي (أأمن).
 */
export function decideMerge(
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown>,
): MergeDecision {
  if (!local) return 'insert';

  const localAt = String(local.updatedAt || local.createdAt || '');
  const remoteAt = String(remote.updatedAt || remote.createdAt || '');

  if (!localAt && !remoteAt) return 'skip';
  if (!remoteAt) return 'skip';
  if (!localAt) return 'update';

  return remoteAt > localAt ? 'update' : 'skip';
}

// ==================== REPORTS ====================

export interface TableSyncResult {
  table: string;
  pushed: number;
  pulled: number;
  skipped: number;
  error?: string;
}

export interface SyncReport {
  ok: boolean;
  direction: 'push' | 'pull';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tables: TableSyncResult[];
  errors: string[];
  /** إجمالي الصفوف اللي اتأثرت */
  total: number;
}

function emptyReport(direction: 'push' | 'pull', startedAt: string): SyncReport {
  return {
    ok: true,
    direction,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    tables: [],
    errors: [],
    total: 0,
  };
}

function isCloudReady(): boolean {
  return getSupabaseConfigured() && getSupabaseClient() !== null;
}

/**
 * تجهيز الاتصال: يتأكد إن فيه عميل + جلسة (RLS بترفض anon).
 * بيرجّع رسالة خطأ واضحة لو فيه مشكلة (مش فشل صامت).
 */
export async function prepareCloud(): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudReady()) {
    return {
      ok: false,
      error: 'Supabase غير مهيأ — أدخل الـ URL والـ anon key من الإعدادات → التخزين السحابي.',
    };
  }
  const session = await ensureCloudSession();
  if (!session.ok) return { ok: false, error: session.error };
  return { ok: true };
}

/** قراءة كل صفوف جدول من السحابة بترقيم (بيتجنب اقتطاع الـ 1000 صف) */
async function fetchAllRows(table: string): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const client = getSupabaseClient()!;
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // جدول مش موجود في مشروع قديم → نتخطاه من غير ما نفشل المزامنة كلها
      return { rows, error: error.message };
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows };
}

// ==================== PUSH ====================

/** رفع البيانات المحلية للسحابة (upsert على مستوى الصف) */
export async function syncLocalToCloud(opts?: { silent?: boolean }): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const report = emptyReport('push', startedAt);

  const ready = await prepareCloud();
  if (!ready.ok) {
    report.ok = false;
    report.errors.push(ready.error!);
    if (!opts?.silent) notify.error(ready.error!);
    return finish(report, startedAt, opts);
  }

  const client = getSupabaseClient()!;
  if (!opts?.silent) notify.loading('جاري رفع البيانات للسحابة...');

  for (const table of CLOUD_TABLES) {
    const result: TableSyncResult = { table, pushed: 0, pulled: 0, skipped: 0 };
    try {
      const localData = await localDB.dbGetAll(table);
      const rows = localData
        .map(item => transformKeys(stripSensitive(item as Record<string, unknown>), toSnakeCase));

      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const batch = rows.slice(i, i + UPSERT_BATCH);
        const { error } = await client.from(table).upsert(batch, { onConflict: 'id' });
        if (error) {
          result.error = error.message;
          break;
        }
        result.pushed += batch.length;
      }
    } catch (e) {
      result.error = String(e);
    }

    report.tables.push(result);
    report.total += result.pushed;
    if (result.error) {
      report.ok = false;
      report.errors.push(`${table}: ${result.error}`);
    }
  }

  return finish(report, startedAt, opts);
}

// ==================== PULL ====================

/**
 * تنزيل البيانات من السحابة **بالدمج** (مش بالمسح).
 * كل صف سحابي بيتقارن بالمحلي عن طريق `updatedAt` — الأحدث بيكسب.
 */
export async function syncCloudToLocal(opts?: { silent?: boolean }): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const report = emptyReport('pull', startedAt);

  const ready = await prepareCloud();
  if (!ready.ok) {
    report.ok = false;
    report.errors.push(ready.error!);
    if (!opts?.silent) notify.error(ready.error!);
    return finish(report, startedAt, opts);
  }

  if (!opts?.silent) notify.loading('جاري تنزيل البيانات من السحابة...');

  for (const table of CLOUD_TABLES) {
    const result: TableSyncResult = { table, pushed: 0, pulled: 0, skipped: 0 };
    try {
      const { rows, error } = await fetchAllRows(table);
      if (error) result.error = error;

      const localRows = (await localDB.dbGetAll(table)) as Record<string, unknown>[];
      const localById = new Map(localRows.map(r => [String(r.id), r]));

      for (const remoteRaw of rows) {
        const remote = transformKeys(remoteRaw, toCamelCase);
        const id = String(remote.id ?? '');
        if (!id) continue;

        const local = localById.get(id);
        const decision = decideMerge(local, remote);

        if (decision === 'skip') {
          result.skipped++;
          continue;
        }

        // settings/counters: مفتاحهم مش UUID لكن نفس المنطق ينفع
        await localDB.dbPut(table, stripSensitive(remote));
        result.pulled++;
      }
    } catch (e) {
      result.error = String(e);
    }

    report.tables.push(result);
    report.total += result.pulled;
    if (result.error) {
      report.ok = false;
      report.errors.push(`${table}: ${result.error}`);
    }
  }

  return finish(report, startedAt, opts);
}

function finish(report: SyncReport, startedAt: string, opts?: { silent?: boolean }): SyncReport {
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - new Date(startedAt).getTime();

  if (opts?.silent) return report;

  if (report.ok) {
    const label = report.direction === 'push' ? 'رفع' : 'تنزيل';
    notify.success(`تم ${label} ${report.total} صف بنجاح`);
  } else {
    const first = report.errors[0] || 'خطأ غير معروف';
    notify.error(`فشلت المزامنة: ${first}`);
  }
  return report;
}

/** ملخص مقروء للتقرير (يُعرض في الإعدادات) */
export function formatSyncReport(report: SyncReport): string {
  const label = report.direction === 'push' ? 'رفع للسحابة' : 'تنزيل من السحابة';
  const lines = [
    `${label} — ${report.ok ? 'نجح' : 'فشل جزئياً'}`,
    `الصفوف: ${report.total} · المدة: ${(report.durationMs / 1000).toFixed(1)}ث`,
  ];
  for (const t of report.tables) {
    if (t.pushed || t.pulled || t.error) {
      lines.push(`  • ${t}: ${t.pushed ? `رفع ${t.pushed}` : ''}${t.pulled ? ` تنزيل ${t.pulled}` : ''}${t.skipped ? ` (تخطى ${t.skipped} أقدم)` : ''}${t.error ? ` ❌ ${t.error}` : ''}`);
    }
  }
  if (report.errors.length) lines.push(`الأخطاء: ${report.errors.join(' | ')}`);
  return lines.join('\n');
}

/** هل الجدول بيتزامن؟ (للاختبارات ولواجهة الإعدادات) */
export function isTableSynced(table: string): boolean {
  return CLOUD_TABLES.includes(table as TableName);
}
