/** Audit contracts; no storage or UI dependencies. */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'export'
  | 'import'
  | 'backup'
  | 'restore'
  | 'void'
  | 'refund'
  | 'payment'
  | 'payroll'
  | 'sync'
  /** تصفير المديونيات (إبراء ذمة) — إلغاء أقساط غير مسددة */
  | 'writeoff';

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
