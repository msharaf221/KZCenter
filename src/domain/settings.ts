import { SUBJECTS } from '../lib/subjects';
import { validateEmail, validatePhone } from '../lib/utils';
import type { Settings } from './models';

export type SettingsDraft = Required<
  Pick<
    Settings,
    | 'centerName'
    | 'address'
    | 'phone'
    | 'email'
    | 'academicYear'
    | 'currency'
    | 'primaryColor'
    | 'fontSize'
    | 'notifyNewStudent'
    | 'notifyAbsence'
    | 'notifyLatePayment'
    | 'graceDays'
    | 'sessionsPerMonth'
    | 'receiptPrefix'
    | 'receiptFooter'
    | 'receiptLayout'
    | 'logo'
    | 'notifyUpcomingDue'
    | 'upcomingDueDays'
    | 'lowStockThreshold'
    | 'subjectPrices'
  >
> &
  Pick<Settings, 'dueDayOfMonth' | 'whatsappGateway'>;

/** Only editable application settings enter the draft; never cloud credentials. */
export function createSettingsDraft(settings?: Settings | null): SettingsDraft {
  return {
    centerName: settings?.centerName || '',
    address: settings?.address || '',
    phone: settings?.phone || '',
    email: settings?.email || '',
    academicYear: settings?.academicYear || '',
    currency: settings?.currency || 'EGP',
    primaryColor: settings?.primaryColor || '#6366f1',
    fontSize: settings?.fontSize || 'md',
    notifyNewStudent: settings?.notifyNewStudent ?? true,
    notifyAbsence: settings?.notifyAbsence ?? true,
    notifyLatePayment: settings?.notifyLatePayment ?? true,
    dueDayOfMonth: settings?.dueDayOfMonth,
    graceDays: settings?.graceDays ?? 0,
    sessionsPerMonth: settings?.sessionsPerMonth ?? 8,
    receiptPrefix: settings?.receiptPrefix || '',
    receiptFooter: settings?.receiptFooter || '',
    receiptLayout: settings?.receiptLayout || 'standard',
    logo: settings?.logo || '',
    notifyUpcomingDue: settings?.notifyUpcomingDue ?? false,
    upcomingDueDays: settings?.upcomingDueDays ?? 3,
    lowStockThreshold: settings?.lowStockThreshold ?? 5,
    subjectPrices: settings?.subjectPrices ?? {},
    whatsappGateway: settings?.whatsappGateway ? { ...settings.whatsappGateway } : { enabled: false, provider: 'ultramsg' },
  };
}

export function validateSettingsDraft(form: SettingsDraft): string | null {
  if (form.email && !validateEmail(form.email)) return 'البريد الإلكتروني غير صحيح';
  if (form.phone && !validatePhone(form.phone)) return 'رقم الهاتف غير صحيح';
  if (form.dueDayOfMonth !== undefined && form.dueDayOfMonth !== null) {
    const d = Number(form.dueDayOfMonth);
    if (!Number.isFinite(d) || d < 1 || d > 28) return 'يوم الاستحقاق لازم يكون بين 1 و 28';
  }
  if (form.sessionsPerMonth < 1 || form.sessionsPerMonth > 40) return 'عدد الحصص في الشهر لازم يكون بين 1 و 40';
  for (const s of SUBJECTS) {
    const v = form.subjectPrices?.[s.id];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
      return `سعر ${s.name} لازم يكون رقم موجب`;
    }
  }
  if (form.whatsappGateway?.enabled && form.whatsappGateway.provider === 'custom' && !form.whatsappGateway.apiUrl?.trim()) {
    return 'يرجى إدخال رابط API المخصص لبوابة واتساب';
  }

  return null;
}
