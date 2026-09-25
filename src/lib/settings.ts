import { billingPolicy, type BillingPolicy } from '../domain/ledger/policy';
/**
 * إعدادات النظام — كاش خفيف + قيم افتراضية
 *
 * كل دوال الفوترة محتاجة إعدادات (يوم الاستحقاق، أيام السماح، عدد الحصص…).
 * عشان ما نقراش IndexedDB مع كل عملية، بنحتفظ بنسخة في الذاكرة بتتحدث
 * من AppContext (`setSettingsCache`) أو بتتقرا مرة عند أول طلب.
 */
import { readById } from '../data/readers';
import type { Settings } from '../domain/models';

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
 * القيم الافتراضية للحقول الناقصة فقط، وليس عند تعذّر قراءة قاعدة البيانات.
 */
export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  const s = await readById<Settings>('settings', 'main');
  cache = { ...DEFAULT_SETTINGS_VALUES, ...(s || {}) };
  return cache;
}

/** قيم سياسة التحصيل في شكل جاهز للفوترة */
export type { BillingPolicy } from '../domain/ledger/policy';

export async function getBillingPolicy(): Promise<BillingPolicy> {
  return billingPolicy(await getSettings());
}
