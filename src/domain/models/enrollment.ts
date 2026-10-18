// ==================== ENROLLMENT (Single Source of Truth) ====================

export type EnrollmentStatus = 'active' | 'transferred' | 'dropped' | 'completed';

export interface Enrollment {
  id: string;
  studentId: string;
  groupId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  droppedAt?: string;
  dropReason?: string;
  /** رقم الحصة اللي التحق منها الطالب (1 = أول حصة في الشهر) — للالتحاق في نص الكورس */
  startSession?: number;
  /** لو الحالة transferred: المجموعة اللي اتحوّل ليها */
  transferredToGroupId?: string;
  initialPayment?: number;

  // ==================== v7: تسعير وخصومات ====================
  /**
   * سعر شهري خاص بالتسجيل ده (يتجاوز سعر الكورس).
   * بيستخدم لما الطالب بيتفق على سعر مختلف أو المجموعة سعرها أعلى/أقل.
   */
  priceOverride?: number;
  /** خصم بقيمة ثابتة على كل قسط */
  discountAmount?: number;
  /** خصم بنسبة مئوية (0-100) على كل قسط — بيتحسب بعد priceOverride */
  discountPercent?: number;
  /** سبب الخصم (إخوة/منحة/حالة اجتماعية/عرض…) */
  discountReason?: string;
  /** حصة/شهر تجريبي مجاني أو بسعر رمزي */
  isTrial?: boolean;

  // ==================== v8: التجديد ====================
  /** عدد مرات تجديد الاشتراك على نفس التسجيل */
  renewalCount?: number;
  /** آخر تجديد */
  renewedAt?: string;
  /** سجل التجديدات (للمتابعة وكشف الحساب) */
  renewals?: EnrollmentRenewal[];

  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** تجديد اشتراك على تسجيل قائم (دورة جديدة من الأقساط) */
export interface EnrollmentRenewal {
  /** رقم الدورة (1 = أول تجديد) */
  cycle: number;
  at: string;
  /** بداية خطة الأقساط الجديدة */
  startDate: string;
  months: number;
  monthlyPrice: number;
  initialPayment?: number;
  byUserId?: string;
  byUsername?: string;
  notes?: string;
}
