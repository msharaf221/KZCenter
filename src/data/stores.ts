import type { StoreName } from './schema';
export type { StoreName } from './schema';

/** كل المتاجر اللي بتدخل في النسخة الاحتياطية (بالترتيب) */
export const BACKUP_STORES: StoreName[] = [
  'students',
  'teachers',
  'courses',
  'groups',
  'payments',
  'attendance',
  'expenses',
  'exams',
  'grades',
  'enrollments',
  'installments',
  'inventory',
  'inventory_transactions',
  // v7
  'refunds',
  'cashbox_sessions',
  'payroll',
  'teacher_advances',
  'message_logs',
  'message_templates',
  'waitlist',
  'audit_logs',
  'counters',
];

/** كل المتاجر المحلية */
export type TableName = Exclude<StoreName, 'users'>;

/**
 * الجداول اللي بتتزامن.
 * ⚠️ `users` **مستثنى عمداً**: فيه password hashes لمستخدمين محليين، ومفيش أي
 * سبب يخليه في السحابة. لو محتاج مستخدمين سحابيين استخدم Supabase Auth.
 */
export const CLOUD_TABLES: TableName[] = [
  'students',
  'teachers',
  'courses',
  'groups',
  'payments',
  'attendance',
  'expenses',
  'exams',
  'grades',
  'enrollments',
  'installments',
  'refunds',
  'inventory',
  'inventory_transactions',
  'payroll',
  'teacher_advances',
  'cashbox_sessions',
  'message_templates',
  'message_logs',
  'waitlist',
  'audit_logs',
  'counters',
  'settings',
];

/** ممنوع من المزامنة (بيانات اعتماد) */
export const NEVER_SYNC_TABLES = ['users'] as const;
