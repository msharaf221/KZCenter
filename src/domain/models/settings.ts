import type { Subject, SubjectPrices } from '../subject';

export interface Settings {
  id: string;
  centerName: string;
  address?: string;
  phone?: string;
  email?: string;
  academicYear?: string;
  currency: string;
  primaryColor: string;
  fontSize: 'sm' | 'md' | 'lg';
  darkMode: boolean;
  notifyNewStudent: boolean;
  notifyAbsence: boolean;
  notifyLatePayment: boolean;

  // ==================== v7: سياسة التحصيل والفواتير ====================
  /**
   * يوم الاستحقاق الموحد للأقساط (1-28).
   * لو محدد، كل الأقساط تستحق في اليوم ده من كل شهر بدل «يوم التسجيل + شهر»،
   * وده بيخلي التحصيل منتظم وقابل للمتابعة.
   */
  dueDayOfMonth?: number;
  /** أيام سماح قبل ما القسط يتحول لـ«متأخر» */
  graceDays?: number;
  /** عدد الحصص في الشهر افتراضياً (لو الكورس/المجموعة مش محددة) */
  sessionsPerMonth?: number;
  /**
   * @deprecated تم إلغاء التسعير بالمواد لصالح تسعير الكورس والمجموعة مباشرة.
   * الحقل محفوظ للتوافق مع استعادة النسخ الاحتياطية القديمة فقط.
   */
  subjectPrices?: SubjectPrices;
  /** بادئة رقم الإيصال (افتراضي: السنة) */
  receiptPrefix?: string;
  /** تذييل الإيصال المطبوع (مثال: «الاشتراك غير قابل للاسترداد بعد أول حصة») */
  receiptFooter?: string;
  /** تخطيط طباعة الإيصال: عادي (A4/A5) أو حراري 80مم أو حراري 58مم */
  receiptLayout?: 'standard' | 'thermal80' | 'thermal58';
  /** شعار المركز (data URL) للإيصالات والتقارير المطبوعة */
  logo?: string;

  // ==================== v7: التنبيهات ====================
  /** تنبيه بالأقساط اللي استحقاقها قرب (قبل ما تتأخر) */
  notifyUpcomingDue?: boolean;
  /** كام يوم قبل الاستحقاق نبدأ التنبيه */
  upcomingDueDays?: number;
  /** حد المخزون المنخفض (تنبيه إعادة الطلب) */
  lowStockThreshold?: number;

  // ==================== v9: بوابة واتساب التلقائية ====================
  /** إعدادات بوابة واتساب للإرسال التلقائي المباشر عبر API */
  whatsappGateway?: {
    enabled?: boolean;
    provider?: 'ultramsg' | 'greenapi' | 'custom';
    instanceId?: string;
    token?: string;
    apiUrl?: string;
  };
  /** المواد الدراسية المخصصة وإعدادات المواد المعدلة من قبل المستخدم */
  customSubjects?: Subject[];
}
