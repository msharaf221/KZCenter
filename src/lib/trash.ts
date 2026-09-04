/**
 * سلة المحذوفات (Recycle Bin)
 *
 * كل الحذف في النظام «ناعم» (`deleted: true`) — يعني البيانات لسه موجودة في القاعدة،
 * لكن مفيش أي طريقة ترجّعها. دلوقتي فيه:
 *  - عرض كل المحذوفات لكل كيان
 *  - استرجاع (بيرجّع الصف ويعيد حساب الأرصدة/حالة المجموعات لو لازم)
 *  - حذف نهائي (purge) للمسؤول
 */
import { dbGetAll, dbPut, getDB, generateId, recalculateStudentTotalPaid, syncGroupStatus } from './db';
import type { StoreName } from './db';

/** المتاجر اللي الحذف فيها ناعم وليها معنى في سلة المحذوفات */
export const TRASHABLE_STORES: StoreName[] = [
  'students', 'teachers', 'courses', 'groups', 'payments', 'expenses',
  'exams', 'inventory', 'enrollments', 'installments', 'refunds',
  'payroll', 'teacher_advances', 'message_templates', 'waitlist', 'users',
];

export const STORE_LABEL: Partial<Record<StoreName, string>> = {
  students: 'الطلاب',
  teachers: 'المدرسون',
  courses: 'الكورسات',
  groups: 'المجموعات',
  payments: 'المدفوعات',
  expenses: 'المصروفات',
  exams: 'الاختبارات',
  inventory: 'المخزون',
  enrollments: 'التسجيلات',
  installments: 'الأقساط',
  refunds: 'الاستردادات',
  payroll: 'الرواتب',
  teacher_advances: 'سلف المدرسين',
  message_templates: 'قوالب الرسائل',
  waitlist: 'قائمة الانتظار',
  users: 'المستخدمون',
};

export interface TrashItem {
  store: StoreName;
  storeLabel: string;
  id: string;
  /** اسم/وصف مقروء للصف */
  label: string;
  deletedAt?: string;
  raw: Record<string, unknown>;
}

/** اسم مقروء لصف حسب نوعه */
function rowLabel(store: StoreName, row: Record<string, unknown>): string {
  const s = (k: string) => String(row[k] ?? '');
  switch (store) {
    case 'students': return `${s('name')} — ولي الأمر: ${s('parentPhone') || '—'}`;
    case 'teachers': return `${s('name')} — ${s('specialization') || ''}`.trim();
    case 'courses': return s('name');
    case 'groups': return `${s('name')} (${s('maxStudents')} طالب)`;
    case 'payments': return `${s('amount')} ${s('date')} ${row.receiptNo ? `· إيصال ${s('receiptNo')}` : ''}`;
    case 'expenses': return `${s('description')} — ${s('amount')}`;
    case 'exams': return `${s('name')} ${s('date')}`;
    case 'inventory': return `${s('name')} (رصيد ${s('stock')})`;
    case 'refunds': return `${s('amount')} — ${s('reason')}`;
    case 'payroll': return `${s('teacherName')} — ${s('period')} (${s('net')})`;
    case 'teacher_advances': return `${s('amount')} ${s('date')}`;
    case 'users': return `${s('username')} (${s('role')})`;
    default: return s('name') || s('id');
  }
}

/** كل المحذوفات (مجمّعة لكل المتاجر) */
export async function getTrash(stores: StoreName[] = TRASHABLE_STORES): Promise<TrashItem[]> {
  const out: TrashItem[] = [];

  for (const store of stores) {
    try {
      const rows = (await dbGetAll<Record<string, unknown>>(store, { includeDeleted: true }))
        .filter(r => r && r.deleted === true);

      for (const row of rows) {
        out.push({
          store,
          storeLabel: STORE_LABEL[store] || store,
          id: String(row.id ?? generateId()),
          label: rowLabel(store, row),
          deletedAt: (row.updatedAt as string) || (row.createdAt as string),
          raw: row,
        });
      }
    } catch (e) {
      console.error(`getTrash(${store}) error:`, e);
    }
  }

  return out.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

/** عدد المحذوفات لكل متجر (للشارة في السايدبار) */
export async function trashCount(): Promise<number> {
  const items = await getTrash();
  return items.length;
}

export interface RestoreResult {
  success: boolean;
  error?: string;
}

/** استرجاع صف محذوف + إصلاح ما يترتب عليه */
export async function restoreFromTrash(store: StoreName, id: string): Promise<RestoreResult> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(store)) return { success: false, error: 'متجر غير معروف' };

    const row = (await db.get(store, id)) as Record<string, unknown> | undefined;
    if (!row) return { success: false, error: 'الصف غير موجود' };
    if (!row.deleted) return { success: false, error: 'الصف مش محذوف أصلاً' };

    await dbPut(store, { ...row, deleted: false, updatedAt: new Date().toISOString() });

    // إصلاح الآثار الجانبية
    if (store === 'students') await recalculateStudentTotalPaid(id);
    if (store === 'groups') await syncGroupStatus(id);
    if (store === 'payments' || store === 'installments' || store === 'refunds') {
      const studentId = String(row.studentId || '');
      if (studentId) await recalculateStudentTotalPaid(studentId);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** حذف نهائي (لا رجعة) — للمسؤول فقط */
export async function purgeFromTrash(store: StoreName, id: string): Promise<RestoreResult> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(store)) return { success: false, error: 'متجر غير معروف' };
    await db.delete(store, id);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/** تفريغ سلة المحذوفات لمتجر معيّن (حذف نهائي للكل) */
export async function purgeStore(store: StoreName): Promise<number> {
  const items = await getTrash([store]);
  let purged = 0;
  for (const item of items) {
    const r = await purgeFromTrash(store, item.id);
    if (r.success) purged++;
  }
  return purged;
}
