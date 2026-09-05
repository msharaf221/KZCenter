/**
 * الصلاحيات — مصفوفة أدوار وإجراءات
 *
 * قبل كده كان فيه دورين بس (admin/teacher)، والمدرس كان بيشوف **كل** طلاب المركز
 * وكل التقارير المالية لأن `/reports` ما كانش adminOnly و`isTeacher()` ما كانتش
 * مستخدمة في أي فلترة بيانات.
 *
 * دلوقتي:
 *  - 5 أدوار: admin (كل حاجة) · secretary (استقبال) · accountant (فلوس)
 *            supervisor (أكاديمي) · teacher (مجموعاته بس)
 *  - مصفوفة صلاحيات على مستوى (كيان × إجراء) — دالة نقية قابلة للاختبار
 *  - عزل بيانات المدرس: `visibleGroupIds()` بترجّع مجموعاته هو بس
 */
import type { UserRole, Group } from './db';

export type Entity =
  | 'students' | 'teachers' | 'courses' | 'groups' | 'inventory'
  | 'payments' | 'refunds' | 'debtors' | 'expenses' | 'payroll' | 'treasury'
  | 'attendance' | 'exams' | 'reports' | 'dailyReports' | 'timetable'
  | 'messages' | 'users' | 'auditLog' | 'settings' | 'trash' | 'backup';

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'money';

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'مسؤول (كل الصلاحيات)',
  secretary: 'سكرتيرة / استقبال',
  accountant: 'محاسب',
  supervisor: 'مشرف أكاديمي',
  teacher: 'مدرس',
};

export const ROLE_SHORT: Record<UserRole, string> = {
  admin: 'مسؤول',
  secretary: 'استقبال',
  accountant: 'محاسب',
  supervisor: 'مشرف',
  teacher: 'مدرس',
};

type Matrix = Record<UserRole, Partial<Record<Entity, Action[]>>>;

const ALL: Action[] = ['view', 'create', 'edit', 'delete', 'export', 'money'];

/**
 * المصفوفة: كل دور له الإجراءات المسموحة على كل كيان.
 * (كيان مش موجود في قائمة الدور = مفيش أي وصول له)
 */
export const PERMISSIONS: Matrix = {
  // المسؤول: كل حاجة
  admin: {
    students: ALL, teachers: ALL, courses: ALL, groups: ALL, inventory: ALL,
    payments: ALL, refunds: ALL, debtors: ALL, expenses: ALL, payroll: ALL,
    treasury: ALL, attendance: ALL, exams: ALL, reports: ALL, dailyReports: ALL,
    timetable: ALL, messages: ALL, users: ALL, auditLog: ALL, settings: ALL,
    trash: ALL, backup: ALL,
  },

  // الاستقبال: تسجيل وتحصيل وحضور — من غير مصروفات ولا رواتب ولا خزينة ولا حذف نهائي
  secretary: {
    students: ['view', 'create', 'edit', 'export'],
    groups: ['view'],
    courses: ['view'],
    teachers: ['view'],
    payments: ['view', 'create', 'export'],
    debtors: ['view', 'export'],
    attendance: ['view', 'create', 'edit', 'export'],
    timetable: ['view'],
    messages: ['view', 'create'],
    inventory: ['view'],
    exams: ['view'],
    reports: [],
    trash: ['view'],
  },

  // المحاسب: الفلوس كلها (تحصيل/استرداد/مصروفات/رواتب/خزينة) من غير تعديل أكاديمي
  accountant: {
    students: ['view', 'export'],
    payments: ALL,
    refunds: ALL,
    debtors: ALL,
    expenses: ALL,
    payroll: ALL,
    treasury: ALL,
    inventory: ['view', 'create', 'edit', 'export'],
    reports: ALL,
    dailyReports: ALL,
    groups: ['view'],
    teachers: ['view'],
    attendance: ['view', 'export'],
    backup: ['view', 'export'],
    auditLog: ['view', 'export'],
  },

  // المشرف الأكاديمي: مجموعات/حضور/اختبارات/جدول — من غير فلوس
  supervisor: {
    students: ['view', 'create', 'edit', 'export'],
    groups: ['view', 'create', 'edit'],
    courses: ['view', 'create', 'edit'],
    teachers: ['view'],
    attendance: ['view', 'create', 'edit', 'export'],
    exams: ['view', 'create', 'edit', 'export'],
    timetable: ['view', 'create', 'edit'],
    messages: ['view', 'create'],
    reports: ['view', 'export'],
    dailyReports: ['view'],
    debtors: ['view'],
    inventory: ['view'],
  },

  // المدرس: مجموعاته هو بس — حضور ودرجات، ومفيش أي وصول للأرقام المالية
  teacher: {
    students: ['view'],
    groups: ['view'],
    attendance: ['view', 'create', 'edit'],
    exams: ['view', 'create', 'edit'],
    timetable: ['view'],
    messages: ['view', 'create'],
  },
};

/** مرادف لـ `Entity` — بيوضح إن المفتاح ده بيستخدم للصفحات في السايدبار */
export type PageKey = Entity;

/** هل الدور عنده الإجراء ده على الكيان ده؟ */
export function can(role: UserRole | undefined | null, entity: Entity, action: Action): boolean {
  if (!role) return false;
  const allowed = PERMISSIONS[role]?.[entity];
  if (!allowed) return false;
  return allowed.includes(action);
}

/** كل الإجراءات المسموحة لدور على كيان */
export function allowedActions(role: UserRole | undefined | null, entity: Entity): Action[] {
  if (!role) return [];
  return PERMISSIONS[role]?.[entity] || [];
}

/** الصفحات اللي الدور يقدر يشوفها في السايدبار */
export function visiblePages(role: UserRole | undefined | null): Entity[] {
  if (!role) return [];
  const entities = Object.keys(PERMISSIONS[role] || {}) as Entity[];
  return entities.filter(e => can(role, e, 'view'));
}

/**
 * عزل بيانات المدرس: المجموعات المسموح له يشوفها.
 * - admin/secretary/accountant/supervisor → كل المجموعات (null = مفيش تقييد)
 * - teacher → مجموعاته هو بس
 *
 * بيرجّع `null` لما مفيش تقييد، و`Set` لما فيه (حتى لو فاضي = مفيش وصول).
 */
export function visibleGroupIds(opts: {
  role: UserRole | undefined | null;
  teacherId?: string;
  groups: Pick<Group, 'id' | 'teacherId'>[];
}): Set<string> | null {
  if (opts.role !== 'teacher') return null;
  if (!opts.teacherId) return new Set<string>();
  return new Set(
    opts.groups.filter(g => g.teacherId === opts.teacherId).map(g => g.id),
  );
}

/** هل المستخدم مقيّد بمجموعات محددة؟ */
export function isScoped(role: UserRole | undefined | null): boolean {
  return role === 'teacher';
}

/** فلترة صفوف فيها groupId حسب الصلاحيات */
export function filterByGroups<T extends { groupId?: string }>(
  rows: T[],
  allowed: Set<string> | null,
): T[] {
  if (!allowed) return rows;
  return rows.filter(r => !!r.groupId && allowed.has(r.groupId));
}
