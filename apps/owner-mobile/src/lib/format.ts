import type { ActivityItem } from './owner-data';

export function formatCurrency(amount: number, currency = 'EGP'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const code = (currency || 'EGP').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const formatted = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value);
    return `${formatted} ${currency || 'EGP'}`;
  }
}

export function formatDayLabel(date = new Date()): string {
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function formatSnapshotTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'وقت غير معروف';
  const day = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${day}، ${time}`;
}

const ACTIONS: Record<string, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  payment: 'تحصيل دفعة',
  refund: 'استرداد مبلغ',
  void: 'إلغاء دفعة',
  payroll: 'عملية راتب',
  writeoff: 'تسوية مديونية',
  import: 'استيراد بيانات',
  backup: 'نسخ احتياطي',
};

const ENTITIES: Record<string, string> = {
  student: 'طالب',
  students: 'طالب',
  payment: 'دفعة',
  payments: 'دفعة',
  expense: 'مصروف',
  expenses: 'مصروف',
  attendance: 'حضور',
  group: 'مجموعة',
  groups: 'مجموعة',
  refund: 'استرداد',
  payroll: 'راتب',
  session: 'جلسة',
};

export function activityTitle(item: ActivityItem): string {
  const action = ACTIONS[item.action] || item.action || 'عملية';
  const entity = ENTITIES[item.entity] || item.entity;
  return entity ? `${action} · ${entity}` : action;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDayBounds(date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
