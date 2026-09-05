/**
 * إعدادات النظام — كاش خفيف + قيم افتراضية
 *
 * كل دوال الفوترة محتاجة إعدادات (يوم الاستحقاق، أيام السماح، عدد الحصص…).
 * عشان ما نقراش IndexedDB مع كل عملية، بنحتفظ بنسخة في الذاكرة بتتحدث
 * من AppContext (`setSettingsCache`) أو بتتقرا مرة عند أول طلب.
 */
import { dbGetById } from './db';
import type { Settings } from './db';

export const DEFAULT_SETTINGS_VALUES: Settings = {
  id: 'main',
  centerName: 'EduCenter Pro',
  currency: 'EGP',
  primaryColor: '#6366f1',
  fontSize: 'md',
  darkMode: false,
  notifyNewStudent: true,
  notifyAbsence: true,
  notifyLatePayment: true,
  notifyUpcomingDue: true,
  upcomingDueDays: 3,
  graceDays: 0,
  sessionsPerMonth: 8,
  lowStockThreshold: 5,
};

let cache: Settings | null = null;

/** يحدّث الكاش (بينادى عليها AppContext بعد كل تغيير) */
export function setSettingsCache(s: Settings | null): void {
  cache = s ? { ...DEFAULT_SETTINGS_VALUES, ...s } : null;
}

export function peekSettings(): Settings | null {
  return cache;
}

/**
 * الإعدادات (من الكاش أو من القاعدة مرة واحدة).
 * مضمونة إنها ترجّع كائن كامل بالقيم الافتراضية.
 */
export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  try {
    const s = await dbGetById<Settings>('settings', 'main');
    cache = { ...DEFAULT_SETTINGS_VALUES, ...(s || {}) };
  } catch {
    cache = { ...DEFAULT_SETTINGS_VALUES };
  }
  return cache;
}

/** قيم سياسة التحصيل في شكل جاهز للفوترة */
export interface BillingPolicy {
  dueDayOfMonth?: number;
  graceDays: number;
  sessionsPerMonth: number;
  receiptPrefix?: string;
}

export async function getBillingPolicy(): Promise<BillingPolicy> {
  const s = await getSettings();
  return {
    dueDayOfMonth: s.dueDayOfMonth && s.dueDayOfMonth >= 1 && s.dueDayOfMonth <= 28
      ? s.dueDayOfMonth
      : undefined,
    graceDays: Math.max(0, s.graceDays || 0),
    sessionsPerMonth: s.sessionsPerMonth && s.sessionsPerMonth > 0 ? s.sessionsPerMonth : 8,
    receiptPrefix: s.receiptPrefix?.trim() || undefined,
  };
}
