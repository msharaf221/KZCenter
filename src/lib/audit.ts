/**
 * سجل المراجعة (Audit Log) — في IndexedDB
 *
 * ليه اتنقل من localStorage؟
 *  - localStorage per-device: كل جهاز له سجل مختلف، ومفيش سجل مركزي.
 *  - بيتمسح بمسح بيانات المتصفح (يعني أي حد يقدر يمحي أثره).
 *  - مش بيدخل في النسخ الاحتياطي ولا المزامنة.
 * دلوقتي السجل في القاعدة → بيتنسخ، بيتزامن، وممكن يتصدّر.
 *
 * السجل القديم في localStorage بيتنقل مرة واحدة تلقائياً (`migrateAuditFromLocalStorage`).
 */
import { dbAdd, dbGetAll, dbGetById, generateId } from './db';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'login' | 'logout'
  | 'export' | 'import' | 'backup' | 'restore'
  | 'void' | 'refund' | 'payment' | 'payroll' | 'sync';

export interface AuditEntry {
  id: string;
  userId: string;
  username: string;
  action: AuditAction | string;
  entity: string;
  entityId?: string;
  details?: string;
  timestamp: string;
  ip?: string;
}

const LEGACY_KEY = 'educenter_audit_log';
const MIGRATION_FLAG = 'audit_migration_v1';
/** سقف عدد السجلات في القاعدة (الأقدم بيتشال) — يحمي من تضخم القاعدة */
const MAX_ENTRIES = 20000;

let migratePromise: Promise<number> | null = null;

/** كل السجلات (الأحدث أولاً) */
export async function getAuditEntries(limit?: number): Promise<AuditEntry[]> {
  try {
    const rows = await dbGetAll<AuditEntry>('audit_logs');
    const sorted = rows.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return typeof limit === 'number' && limit > 0 ? sorted.slice(0, limit) : sorted;
  } catch {
    return [];
  }
}

export async function getAuditEntry(id: string): Promise<AuditEntry | undefined> {
  return dbGetById<AuditEntry>('audit_logs', id);
}

/**
 * إضافة سجل. fire-and-forget: بتترجّع void عشان كل نداءات
 * `addAuditEntry({...})` الموجودة في الصفحات تفضل شغالة من غير await.
 */
export function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  const record: AuditEntry = {
    ...entry,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };

  void (async () => {
    try {
      await dbAdd('audit_logs', record);
      await trimAuditLog();
      window.dispatchEvent(new Event('audit_log_updated'));
    } catch (e) {
      console.error('addAuditEntry error:', e);
    }
  })();
}

/** مسح السجل (للمسؤول فقط — وبيسجّل نفسه كحدث) */
export async function clearAuditLog(by?: { userId: string; username: string }): Promise<void> {
  const db = await (await import('./db')).getDB();
  await db.clear('audit_logs');
  if (by) {
    await dbAdd('audit_logs', {
      id: generateId(),
      userId: by.userId,
      username: by.username,
      action: 'delete',
      entity: 'audit_log',
      details: 'تم مسح سجل المراجعة',
      timestamp: new Date().toISOString(),
    } satisfies AuditEntry);
  }
  window.dispatchEvent(new Event('audit_log_updated'));
}

/** قصّ السجل لو عدّى الحد (بيشال الأقدم) */
async function trimAuditLog(): Promise<void> {
  const db = await (await import('./db')).getDB();
  const all = (await db.getAll('audit_logs')) as AuditEntry[];
  if (all.length <= MAX_ENTRIES) return;

  const sorted = all.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const tx = db.transaction('audit_logs', 'readwrite');
  for (const old of sorted.slice(MAX_ENTRIES)) {
    await tx.store.delete(old.id);
  }
  await tx.done;
}

/** نقل السجل القديم من localStorage (مرة واحدة) */
export async function migrateAuditFromLocalStorage(): Promise<number> {
  if (migratePromise) return migratePromise;

  migratePromise = (async () => {
    try {
      if (localStorage.getItem(MIGRATION_FLAG)) return 0;

      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) {
        localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
        return 0;
      }

      const legacy = JSON.parse(raw) as AuditEntry[];
      if (!Array.isArray(legacy) || legacy.length === 0) {
        localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
        return 0;
      }

      const existing = await getAuditEntries();
      const known = new Set(existing.map(e => e.id));
      let moved = 0;

      for (const entry of legacy) {
        if (!entry || known.has(entry.id)) continue;
        await dbAdd('audit_logs', {
          id: entry.id || generateId(),
          userId: entry.userId || 'unknown',
          username: entry.username || 'غير معروف',
          action: entry.action || 'update',
          entity: entry.entity || 'unknown',
          entityId: entry.entityId,
          details: entry.details,
          timestamp: entry.timestamp || new Date().toISOString(),
          ip: entry.ip,
        } satisfies AuditEntry);
        moved++;
      }

      localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
      // السيب القديم كنسخة أمان (مش بنمسحه تلقائياً)
      return moved;
    } catch (e) {
      console.error('migrateAuditFromLocalStorage error:', e);
      return 0;
    }
  })();

  return migratePromise;
}

/** إحصاءات سريعة للسجل */
export async function auditStats(): Promise<{
  total: number;
  today: number;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
}> {
  const rows = await getAuditEntries();
  const today = new Date().toISOString().slice(0, 10);
  const byAction: Record<string, number> = {};
  const byUser: Record<string, number> = {};

  for (const r of rows) {
    byAction[r.action] = (byAction[r.action] || 0) + 1;
    byUser[r.username] = (byUser[r.username] || 0) + 1;
  }

  return {
    total: rows.length,
    today: rows.filter(r => (r.timestamp || '').startsWith(today)).length,
    byAction,
    byUser,
  };
}
