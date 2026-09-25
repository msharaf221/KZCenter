import { openDB, type IDBPDatabase } from 'idb';
import type { DatabaseSchema, StoreName } from './schema';

// ==================== DB INIT ====================

export const DB_NAME = 'EduCenterProDB';

/**
 * الإصدارات:
 *  6 → المتاجر الأساسية + enrollments + installments
 *  7 → audit_logs (سجل مراجعة في القاعدة بدل localStorage) · counters (ترقيم الإيصالات)
 *      refunds (استرداد) · cashbox_sessions (الخزينة/التقفيل) · payroll + teacher_advances
 *      (رواتب المدرسين) · message_logs + message_templates (تواصل أولياء الأمور)
 *      waitlist (قائمة الانتظار) + فهارس إضافية على payments
 */
export const DB_VERSION = 7;

export type AppDatabase = IDBPDatabase<DatabaseSchema>;
let connection: Promise<AppDatabase> | null = null;

/** All concurrent callers share one opening attempt (including React StrictMode). */
export function getDB(): Promise<AppDatabase> {
  if (connection) return connection;
  const opening: Promise<AppDatabase> = Promise.resolve()
    .then(() =>
      openDB<DatabaseSchema>(DB_NAME, DB_VERSION, {
        blocking() {
          if (connection === opening) connection = null;
          void opening.then(db => db.close());
        },
        terminated() {
          if (connection === opening) connection = null;
        },
        upgrade(db, _oldVersion, _newVersion, tx) {
          // Students
          if (!db.objectStoreNames.contains('students')) {
            const s = db.createObjectStore('students', { keyPath: 'id' });
            s.createIndex('by-status', 'status');
            s.createIndex('by-name', 'name');
            s.createIndex('by-parentPhone', 'parentPhone');
          }

          // Teachers
          if (!db.objectStoreNames.contains('teachers')) {
            const s = db.createObjectStore('teachers', { keyPath: 'id' });
            s.createIndex('by-status', 'status');
            s.createIndex('by-name', 'name');
          }

          // Courses
          if (!db.objectStoreNames.contains('courses')) {
            const s = db.createObjectStore('courses', { keyPath: 'id' });
            s.createIndex('by-name', 'name');
          }

          // Groups
          if (!db.objectStoreNames.contains('groups')) {
            const s = db.createObjectStore('groups', { keyPath: 'id' });
            s.createIndex('by-courseId', 'courseId');
            s.createIndex('by-teacherId', 'teacherId');
            s.createIndex('by-status', 'status');
          }

          // Payments
          if (!db.objectStoreNames.contains('payments')) {
            const s = db.createObjectStore('payments', { keyPath: 'id' });
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-status', 'status');
            s.createIndex('by-date', 'date');
          }

          // Attendance
          if (!db.objectStoreNames.contains('attendance')) {
            const s = db.createObjectStore('attendance', { keyPath: 'id' });
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-groupId', 'groupId');
            s.createIndex('by-date', 'date');
            s.createIndex('by-groupDate', ['groupId', 'date']);
          }

          // Users
          if (!db.objectStoreNames.contains('users')) {
            const s = db.createObjectStore('users', { keyPath: 'id' });
            s.createIndex('by-username', 'username');
          }

          // Settings
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'id' });
          }

          // Expenses
          if (!db.objectStoreNames.contains('expenses')) {
            const s = db.createObjectStore('expenses', { keyPath: 'id' });
            s.createIndex('by-category', 'category');
            s.createIndex('by-date', 'date');
          }

          // Exams
          if (!db.objectStoreNames.contains('exams')) {
            const s = db.createObjectStore('exams', { keyPath: 'id' });
            s.createIndex('by-groupId', 'groupId');
            s.createIndex('by-date', 'date');
          }

          // Grades
          if (!db.objectStoreNames.contains('grades')) {
            const s = db.createObjectStore('grades', { keyPath: 'id' });
            s.createIndex('by-examId', 'examId');
            s.createIndex('by-studentId', 'studentId');
          }

          // Inventory
          if (!db.objectStoreNames.contains('inventory')) {
            const s = db.createObjectStore('inventory', { keyPath: 'id' });
            s.createIndex('by-type', 'type');
            s.createIndex('by-courseId', 'courseId');
          }

          // Inventory Transactions
          if (!db.objectStoreNames.contains('inventory_transactions')) {
            const s = db.createObjectStore('inventory_transactions', { keyPath: 'id' });
            s.createIndex('by-itemId', 'itemId');
            s.createIndex('by-date', 'date');
          }

          // Enrollments (Single Source of Truth for student-group relationship)
          if (!db.objectStoreNames.contains('enrollments')) {
            const s = db.createObjectStore('enrollments', { keyPath: 'id' });
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-groupId', 'groupId');
            s.createIndex('by-status', 'status');
            s.createIndex('by-studentGroup', ['studentId', 'groupId']);
          }

          // Installments (الأقساط/المستحقات — وحدة الدين الحقيقية)
          if (!db.objectStoreNames.contains('installments')) {
            const s = db.createObjectStore('installments', { keyPath: 'id' });
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-groupId', 'groupId');
            s.createIndex('by-status', 'status');
            s.createIndex('by-dueDate', 'dueDate');
            s.createIndex('by-studentGroup', ['studentId', 'groupId']);
          }

          // ==================== v7 ====================

          // سجل المراجعة — في القاعدة (مش localStorage) عشان يتنسخ ويتزامن
          if (!db.objectStoreNames.contains('audit_logs')) {
            const s = db.createObjectStore('audit_logs', { keyPath: 'id' });
            s.createIndex('by-timestamp', 'timestamp');
            s.createIndex('by-action', 'action');
            s.createIndex('by-entity', 'entity');
            s.createIndex('by-userId', 'userId');
          }

          // عدّادات تسلسلية (ترقيم الإيصالات)
          if (!db.objectStoreNames.contains('counters')) {
            db.createObjectStore('counters', { keyPath: 'id' });
          }

          // استرداد/إلغاء دفعات
          if (!db.objectStoreNames.contains('refunds')) {
            const s = db.createObjectStore('refunds', { keyPath: 'id' });
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-date', 'date');
            s.createIndex('by-paymentId', 'paymentId');
          }

          // الخزينة: ورديات/تقفيل يومي
          if (!db.objectStoreNames.contains('cashbox_sessions')) {
            const s = db.createObjectStore('cashbox_sessions', { keyPath: 'id' });
            s.createIndex('by-status', 'status');
            s.createIndex('by-openedAt', 'openedAt');
            s.createIndex('by-date', 'date');
          }

          // رواتب المدرسين
          if (!db.objectStoreNames.contains('payroll')) {
            const s = db.createObjectStore('payroll', { keyPath: 'id' });
            s.createIndex('by-teacherId', 'teacherId');
            s.createIndex('by-period', 'period');
            s.createIndex('by-teacherPeriod', ['teacherId', 'period']);
            s.createIndex('by-status', 'status');
          }

          // سلف/عهدة المدرسين
          if (!db.objectStoreNames.contains('teacher_advances')) {
            const s = db.createObjectStore('teacher_advances', { keyPath: 'id' });
            s.createIndex('by-teacherId', 'teacherId');
            s.createIndex('by-date', 'date');
          }

          // تواصل أولياء الأمور (سجل مراسلات)
          if (!db.objectStoreNames.contains('message_logs')) {
            const s = db.createObjectStore('message_logs', { keyPath: 'id' });
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-date', 'date');
            s.createIndex('by-channel', 'channel');
          }

          // قوالب الرسائل
          if (!db.objectStoreNames.contains('message_templates')) {
            const s = db.createObjectStore('message_templates', { keyPath: 'id' });
            s.createIndex('by-kind', 'kind');
          }

          // قائمة الانتظار للمجموعات المكتملة
          if (!db.objectStoreNames.contains('waitlist')) {
            const s = db.createObjectStore('waitlist', { keyPath: 'id' });
            s.createIndex('by-groupId', 'groupId');
            s.createIndex('by-studentId', 'studentId');
            s.createIndex('by-groupStudent', ['groupId', 'studentId']);
          }

          // ==================== فهارس مضافة لمتاجر موجودة ====================
          // (المتاجر القديمة مش هتدخل بلوك الإنشاء فوق، فلازم نضيف الفهارس صراحة)
          const ensureIndex = (store: StoreName, name: string, keyPath: string | string[]) => {
            if (!db.objectStoreNames.contains(store)) return;
            const s = tx.objectStore(store);
            if (!s.indexNames.contains(name)) s.createIndex(name, keyPath);
          };

          // فهارس التحصيل والتقفيل حسب المجموعة/التاريخ — أسماؤها محفوظة للتوافق.
          ensureIndex('payments', 'by-groupId', 'groupId');
          ensureIndex('payments', 'by-type', 'type');
          ensureIndex('payments', 'by-collectedBy', 'collectedBy');
          ensureIndex('expenses', 'by-teacherId', 'teacherId');
          ensureIndex('students', 'by-updatedAt', 'updatedAt');
        },
      }),
    )
    .catch(error => {
      if (connection === opening) connection = null;
      throw error;
    });
  connection = opening;
  return opening;
}

/** Close without deleting data; the next read opens a fresh connection. */
export async function closeDatabase(): Promise<void> {
  const previous = connection;
  connection = null;
  if (previous) (await previous).close();
}
