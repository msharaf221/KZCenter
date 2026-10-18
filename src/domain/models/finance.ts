import type { ExpenseCategory, PaymentMethod, PaymentStatus, PaymentType } from './common';

export interface Payment {
  id: string;
  studentId: string;
  courseId?: string;
  /** المجموعة المرتبطة بالدفعة (اختياري — يُملأ عند الدفع على أقساط مجموعة محددة) */
  groupId?: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  date: string;
  notes?: string;
  /** الأقساط التي غطّتها هذه الدفعة */
  installmentIds?: string[];

  // ==================== v7: محاسبة ومسؤولية ====================
  /** طريقة القبض (كاش/محفظة/إنستاباي/فيزا/تحويل) — أساس مطابقة الخزينة */
  method?: PaymentMethod;
  /** المستخدم اللي سجّل الدفعة (مساءلة + تقرير تحصيل لكل موظف) */
  collectedBy?: string;
  collectedByName?: string;
  /** رقم إيصال تسلسلي (مثال: 2026-0001) — مش معرّف عشوائي */
  receiptNo?: string;
  /** دفعة ملغاة (void): بتفضل في السجل للأثر لكن مش بتتحسب في أي مجموع */
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
  voidedBy?: string;

  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** استرداد مبلغ لطالب (انسحاب/دفعة بالغلط/خصم خدمة) */
export interface Refund {
  id: string;
  studentId: string;
  /** الدفعة الأصلية لو الاسترداد مرتبط بيها */
  paymentId?: string;
  groupId?: string;
  amount: number;
  reason: string;
  /** الطريقة اللي اتصرف بيها الفلوس */
  method?: PaymentMethod;
  date: string;
  userId?: string;
  username?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** وردية/تقفيل خزينة */
export interface CashSession {
  id: string;
  /** اليوم اللي بيتقفل (YYYY-MM-DD) */
  date: string;
  status: 'open' | 'closed';
  openedAt: string;
  openedBy?: string;
  openedByName?: string;
  /** رصيد أول المدة (نقدي) */
  openingBalance: number;
  closedAt?: string;
  closedBy?: string;
  closedByName?: string;
  /** المفروض في الدرج (محسوب من الدفعات − الاسترداد − المصروفات النقدية) */
  expectedCash?: number;
  /** المعدود فعلياً */
  countedCash?: number;
  /** الفرق (counted − expected): سالب = عجز، موجب = زيادة */
  difference?: number;
  /** تفصيل المحصّل بكل طريقة وقت التقفيل (لقطة ثابتة) */
  byMethod?: Record<PaymentMethod, number>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** عدّاد تسلسلي (ترقيم الإيصالات) */
export interface Counter {
  id: string;
  value: number;
  updatedAt: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  date: string;

  // ==================== v7: تتبع ومسؤولية ====================
  /** ربط بمجموعة (مصروف مباشر → يدخل في ربحية المجموعة) */
  groupId?: string;
  /** ربط بمدرس (رواتب/مكافآت) */
  teacherId?: string;
  /** سند صرف مرتبط بكشف راتب؛ لا يُعدّل يدوياً من المصروفات */
  payrollId?: string;
  /** المستخدم اللي سجّل المصروف */
  userId?: string;
  username?: string;
  /** طريقة الدفع */
  method?: PaymentMethod;
  /** مصروف متكرر شهرياً (إيجار/كهربا/نت) — بيتولد تلقائياً */
  recurring?: 'none' | 'monthly' | 'weekly' | 'yearly';
  /** مرفق (صورة الفاتورة) كـ data URL */
  attachment?: string;
  attachmentName?: string;
  /** رقم سند/فاتورة المورد */
  reference?: string;

  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}
