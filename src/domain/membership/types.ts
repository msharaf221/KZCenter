import type { PaymentMethod } from '../models';

export interface EnrollOptions {
  startSession?: number;
  // ==================== v7: تسعير وخصومات ====================
  /** سعر شهري خاص بالتسجيل (يتجاوز سعر الكورس) */
  priceOverride?: number;
  /** خصم ثابت (جنيه) */
  discountAmount?: number;
  /** خصم نسبة (0-100) */
  discountPercent?: number;
  /** سبب الخصم (إخوة/منحة/حالة اجتماعية/عرض) */
  discountReason?: string;
  /** تسجيل تجريبي */
  isTrial?: boolean;
  // ==================== v7: بيانات الدفعة الأولى ====================
  paymentMethod?: PaymentMethod;
  collectedBy?: string;
  collectedByName?: string;
}
