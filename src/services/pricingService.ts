import type { Course, Enrollment, Group, Student } from '../domain/models';
import { round2 } from '../lib/money';

export interface CalculateEffectivePriceInput {
  student?: Partial<Student> | null;
  enrollment?: Partial<Enrollment> | null;
  group?: Partial<Group> | null;
  course?: Partial<Course> | null;
  /** سعر خاص بالتسجيل/الطالب يتجاوز سعر المجموعة وسعر الكورس */
  priceOverride?: number | null;
  /** خصم ثابت (جنيه) على كل قسط */
  discountAmount?: number | null;
  /** خصم نسبة مئوية (0-100) */
  discountPercent?: number | null;
}

/**
 * فحص ما إذا كان للمجموعة سعر خاص محدد.
 * السعر 0 يُعتبر سعراً صحيحاً (مجموعة مجانية) وليس قيمة مفقودة.
 */
export function isGroupPriceCustom(group?: Partial<Group> | null): boolean {
  return typeof group?.price === 'number' && Number.isFinite(group.price) && group.price >= 0;
}

/**
 * الحصول على سعر الكتالوج الأساسي (سعر المجموعة إن وُجد، وإلا سعر الكورس).
 * السعر 0 مسموح به تماماً ويُفرّق بدقة عن غير المحدد (null/undefined).
 */
export function getCatalogPrice(opts: {
  group?: Partial<Group> | null;
  course?: Partial<Course> | null;
}): number {
  if (isGroupPriceCustom(opts.group)) {
    return Math.max(0, opts.group!.price!);
  }
  if (typeof opts.course?.price === 'number' && Number.isFinite(opts.course.price) && opts.course.price >= 0) {
    return opts.course.price;
  }
  return 0;
}

/**
 * حساب السعر الشهري الفعلي (Single Source of Truth في طبقة الخدمة).
 *
 * أولوية الحساب الصارمة:
 * 1) السعر الخاص بتسجيل الطالب (priceOverride) إن وُجد (بما في ذلك السعر 0).
 * 2) السعر الخاص بالمجموعة (group.price) إن وُجد (بما في ذلك السعر 0).
 * 3) السعر الأساسي للكورس (course.price) إن وُجد (بما في ذلك السعر 0).
 *
 * الخصومات:
 * تُطبّق بعد تحديد السعر الأساسي بنفس الترتيب الحالي المعتمد:
 * خصم النسبة المئوية أولاً، ثم خصم المبلغ الثابت، ولا يقل الناتج النهائي عن صفر.
 */
export function calculateEffectivePrice(input: CalculateEffectivePriceInput): number {
  // 1) فحص السعر الخاص بالطالب (تجاوز صريح أو من سجل التسجيل)
  const overrideVal = input.priceOverride !== undefined && input.priceOverride !== null
    ? input.priceOverride
    : input.enrollment?.priceOverride;
  const hasOverride = typeof overrideVal === 'number' && Number.isFinite(overrideVal) && overrideVal >= 0;

  // 2) تحديد الأساس وفق ترتيب الأولوية
  let base: number;
  if (hasOverride) {
    base = Number(overrideVal);
  } else if (isGroupPriceCustom(input.group)) {
    base = Number(input.group!.price);
  } else if (typeof input.course?.price === 'number' && Number.isFinite(input.course.price) && input.course.price >= 0) {
    base = input.course.price;
  } else {
    base = 0;
  }

  // 3) تطبيق الخصومات
  let price = Math.max(0, base);
  const discountPercent = input.discountPercent !== undefined && input.discountPercent !== null
    ? input.discountPercent
    : input.enrollment?.discountPercent;
  const pct = Math.min(100, Math.max(0, discountPercent || 0));
  if (pct > 0) {
    price = price * (1 - pct / 100);
  }

  const discountAmount = input.discountAmount !== undefined && input.discountAmount !== null
    ? input.discountAmount
    : input.enrollment?.discountAmount;
  price -= Math.max(0, discountAmount || 0);

  return round2(Math.max(0, price));
}

/**
 * تفصيل حساب السعر لعرضه في الواجهات والإيصالات مع بيان التوفير
 */
export function getEffectivePricingBreakdown(input: CalculateEffectivePriceInput): {
  catalogBase: number;
  effectiveBase: number;
  final: number;
  saved: number;
  isGroupCustom: boolean;
  isOverridden: boolean;
} {
  const catalogBase = getCatalogPrice(input);
  const final = calculateEffectivePrice(input);
  const overrideVal = input.priceOverride !== undefined && input.priceOverride !== null
    ? input.priceOverride
    : input.enrollment?.priceOverride;
  const hasOverride = typeof overrideVal === 'number' && Number.isFinite(overrideVal) && overrideVal >= 0;
  const baseBeforeDiscount = hasOverride ? Number(overrideVal) : catalogBase;

  return {
    catalogBase: round2(catalogBase),
    effectiveBase: round2(baseBeforeDiscount),
    final,
    saved: round2(Math.max(0, catalogBase - final)),
    isGroupCustom: isGroupPriceCustom(input.group),
    isOverridden: hasOverride,
  };
}
