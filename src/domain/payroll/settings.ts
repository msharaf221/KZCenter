import { formatCurrency } from '../../lib/utils';
import type { TeacherPayModel } from '../models';
import type { TeacherPaySettings } from './types';

export const PAY_MODEL_LABEL: Record<TeacherPayModel, string> = {
  subscription_percentage: 'نسبة من اشتراك الطالب',
  fixed: 'راتب شهري ثابت',
  per_session: 'بالحصص المسلَّمة',
  percentage: 'نسبة من المحصّل',
  per_group: 'مبلغ لكل مجموعة',
};

export function isPercentageModel(model: TeacherPayModel): boolean {
  return model === 'subscription_percentage' || model === 'percentage';
}

export function validateTeacherPaySettings(settings: TeacherPaySettings): string | null {
  const model = settings.payModel || 'fixed';
  if (!Object.prototype.hasOwnProperty.call(PAY_MODEL_LABEL, model)) return 'طريقة حساب المستحقات غير صحيحة';
  const value = model === 'fixed' ? settings.salary : settings.payRate;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return isPercentageModel(model) ? 'أدخل نسبة صحيحة من 0 إلى 100' : 'أدخل مبلغاً صحيحاً لا يقل عن صفر';
  }
  if (isPercentageModel(model) && value > 100) return 'نسبة المدرس يجب أن تكون من 0 إلى 100';
  if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return 'استخدم منزلتين عشريتين بحد أقصى';
  return null;
}

export function describeTeacherPay(t: TeacherPaySettings, currency?: string): string {
  const model = t.payModel || 'fixed';
  if (validateTeacherPaySettings(t)) return 'لم تُضبط المستحقات — حدد نسبة المدرس';
  switch (model) {
    case 'subscription_percentage':
      return `${t.payRate}% من اشتراك كل طالب`;
    case 'percentage':
      return `${t.payRate}% من المحصّل فعلياً`;
    case 'per_session':
      return `${formatCurrency(t.payRate || 0, currency)} / حصة`;
    case 'per_group':
      return `${formatCurrency(t.payRate || 0, currency)} / مجموعة / شهر`;
    default:
      return `${formatCurrency(t.salary || 0, currency)} / شهر (ثابت)`;
  }
}

export function isPayrollPeriod(period: string): boolean {
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(period);
}
