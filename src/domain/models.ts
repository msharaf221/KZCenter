import type { SubjectId, SubjectPrices } from '../lib/subjects';

// ==================== INTERFACES ====================

export type StudentStatus = 'active' | 'suspended' | 'ended';

export type Gender = 'male' | 'female';

export type TeacherStatus = 'active' | 'vacation' | 'suspended';

/**
 * طريقة حساب مستحقات المدرس:
 *  - fixed      → راتب شهري ثابت
 *  - per_session→ مبلغ لكل حصة مسلَّمة (بيتحسب من أيام الحضور المسجلة)
 *  - percentage → نسبة % من المحصّل فعلياً لمجموعاته في الشهر (توافق قديم)
 *  - subscription_percentage → نسبة من قيمة اشتراكات الشهر، سواء سُددت أم لا
 *  - per_group  → مبلغ ثابت لكل مجموعة في الشهر
 */
export type TeacherPayModel = 'fixed' | 'per_session' | 'percentage' | 'subscription_percentage' | 'per_group';

export type GroupStatus = 'open' | 'full' | 'ended';

export type PaymentStatus = 'paid' | 'pending' | 'late';

export type PaymentType = 'subscription' | 'books' | 'other';

/** طريقة القبض — مطلوبة لمطابقة الخزينة والبنك/المحفظة */
export type PaymentMethod =
  | 'cash' // نقدي
  | 'wallet' // محفظة (فودافون كاش / اتصالات كاش / أورنج كاش)
  | 'instapay' // إنستاباي
  | 'card' // فيزا/ماستركارد (POS)
  | 'bank' // تحويل بنكي
  | 'other';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

/**
 * الأدوار:
 *  - admin      → كل حاجة
 *  - secretary  → استقبال: تسجيل طلاب/حضور/تحصيل، من غير مصروفات ولا رواتب ولا حذف
 *  - accountant → فلوس وتقارير مالية، من غير تعديل أكاديمي
 *  - supervisor → إشراف أكاديمي: مجموعات/حضور/اختبارات، من غير فلوس
 *  - teacher    → مجموعاته هو بس (حضور + درجات)
 * الصلاحيات التفصيلية في src/lib/permissions.ts
 */
export type UserRole = 'admin' | 'secretary' | 'accountant' | 'supervisor' | 'teacher';

export type ExpenseCategory = 'salaries' | 'bills' | 'maintenance' | 'purchases' | 'rent' | 'other';

export interface Student {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  phone?: string;
  parentPhone: string;
  avatar?: string;
  notes?: string;
  status: StudentStatus;
  totalPaid: number;
  totalOwed?: number;
  enrolledGroups: string[];

  // ==================== v7: CRM ومتابعة ====================
  /** المدرسة (لتقارير ولي الأمر والمتابعة) */
  school?: string;
  /** الصف الدراسي */
  gradeLevel?: string;
  /** مصدر معرفة الطالب بالمركز (إعلان فيسبوك/توصية/لافتة…) — لقياس تكلفة الاكتساب */
  source?: string;
  /** اسم ولي الأمر */
  parentName?: string;
  /** إخوة في نفس المركز (لخصم الإخوة) */
  siblingIds?: string[];

  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  specialization: string;
  /**
   * المواد اللي المدرس بيدرّسها (مفاتيح من كاتالوج المواد).
   * بتتملي تلقائياً من مواد مجموعاته لو مش متحددة يدوياً.
   */
  subjectIds?: SubjectId[];
  phone: string;
  email?: string;
  /** الراتب الشهري الثابت (يُستخدم مع payModel = 'fixed' فقط) */
  salary: number;
  status: TeacherStatus;
  avatar?: string;
  notes?: string;

  // ==================== v7: مستحقات المدرس ====================
  /** طريقة الحساب — لو مش محددة بتعتبر 'fixed' (سلوك قديم) */
  payModel?: TeacherPayModel;
  /**
   * قيمة طريقة الحساب:
   *  per_session → جنيه/حصة · percentage / subscription_percentage → نسبة (0-100)
   *  per_group → جنيه/مجموعة/شهر
   *  fixed → بيستخدم `salary`
   */
  payRate?: number;
  payNotes?: string;

  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** سجل مستحقات/راتب مدرس عن شهر */
export interface PayrollRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  /** YYYY-MM */
  period: string;
  model: TeacherPayModel;
  /** نسبة/سعر المدرس وقت اعتماد الكشف؛ لا يتغير بتعديل بياناته لاحقاً */
  rate?: number;
  /** الأساس المحسوب عليه (عدد حصص / إجمالي محصّل / عدد مجموعات) */
  base: number;
  baseLabel: string;
  /** المستحق قبل الخصومات */
  gross: number;
  /** خصومات (غياب/جزاءات) */
  deductions: number;
  /** سلف اتخصمت من الشهر ده */
  advances: number;
  /** الصافي المستحق */
  net: number;
  /** المدفوع فعلياً */
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid';
  /** تفصيل الحساب لكل مجموعة (للشفافية مع المدرس) */
  lines?: PayrollLine[];
  /** رقم سند الصرف في المصروفات (لو اتسجل تلقائياً) */
  expenseId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface PayrollLine {
  groupId: string;
  groupName: string;
  /** حصص مسلَّمة في الشهر (من أيام الحضور المسجلة) */
  sessions: number;
  /** محصّل المجموعة في الشهر */
  collected: number;
  /** تكلفة المدرس على المجموعة دي */
  amount: number;
  /** قيمة الاشتراكات المسجلة للشهر، بغض النظر عن السداد */
  subscriptions?: number;
  /** لقطة تفصيل نصيب المدرس من كل طالب في المجموعة */
  students?: PayrollStudentLine[];
}

export interface PayrollStudentLine {
  studentId: string;
  studentName: string;
  installmentIds: string[];
  /** إجمالي اشتراكات الطالب في هذه المجموعة وهذا الشهر */
  subscriptionAmount: number;
  /** نسبة المدرس وقت الحساب */
  rate: number;
  amount: number;
}

/** سلفة/عهدة على مدرس */
export interface TeacherAdvance {
  id: string;
  teacherId: string;
  amount: number;
  date: string;
  reason?: string;
  /** ملاحظات (مثل تتبّع الخصم الجزئي عند ترحيل باقي السلفة) */
  notes?: string;
  /** اتخصمت من أنهي شهر (YYYY-MM) */
  settledInPeriod?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Course {
  id: string;
  name: string;
  category: string;
  description?: string;
  /**
   * المادة اللي الكورس بيدرّسها (english / math / hesab / arabic / quran).
   * لما تكون محددة، سعر الكورس بيتحكم فيه سعر المادة (من الإعدادات أو الافتراضي)،
   * والتقارير بتقدر تجمّع الفلوس والمجموعات بالمادة مش بالاسم الحر.
   */
  subjectId?: SubjectId;
  price: number;
  durationMonths: number;
  icon: string;
  color: string;
  levels: CourseLevel[];
  /**
   * عدد الحصص في الشهر للكورس ده.
   * لو مش محدد بيتحسب من جدول المجموعة (عدد الأيام × 4)، ولو مفيش جدول
   * بيستخدم الإعداد العام `settings.sessionsPerMonth` (الافتراضي 8).
   */
  sessionsPerMonth?: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface CourseLevel {
  id: string;
  name: string;
  order: number;
}

export interface Group {
  id: string;
  name: string;
  courseId: string;
  levelId?: string;
  /**
   * مادة المجموعة — بتتورّث من الكورس افتراضياً، وبتتخزن هنا عشان
   * الفلترة والتقارير (والحالات النادرة اللي مجموعة فيها مادة مختلفة).
   */
  subjectId?: SubjectId;
  teacherId: string;
  schedule: ScheduleItem[];
  maxStudents: number;
  status: GroupStatus;
  studentIds: string[];
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface ScheduleItem {
  days: string[];
  startTime: string;
  endTime: string;
  room?: string;
}

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

export interface Attendance {
  id: string;
  studentId: string;
  groupId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  teacherId?: string;
  /** When true, the user must change their password on next login */
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

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
   * أسعار المواد الشهرية (تتجاوز الافتراضي في `lib/subjects`).
   * مثال: { english: 250, math: 250, hesab: 200, arabic: 200, quran: 200 }
   */
  subjectPrices?: SubjectPrices;
  /** بادئة رقم الإيصال (افتراضي: السنة) */
  receiptPrefix?: string;
  /** تذييل الإيصال المطبوع (مثال: «الاشتراك غير قابل للاسترداد بعد أول حصة») */
  receiptFooter?: string;
  /** شعار المركز (data URL) للإيصالات والتقارير المطبوعة */
  logo?: string;

  // ==================== v7: التنبيهات ====================
  /** تنبيه بالأقساط اللي استحقاقها قرب (قبل ما تتأخر) */
  notifyUpcomingDue?: boolean;
  /** كام يوم قبل الاستحقاق نبدأ التنبيه */
  upcomingDueDays?: number;
  /** حد المخزون المنخفض (تنبيه إعادة الطلب) */
  lowStockThreshold?: number;
}

/** رسالة لولي أمر (سجل مراسلات) */
export interface MessageLog {
  id: string;
  studentId?: string;
  studentName?: string;
  phone?: string;
  /** سبب/نوع الرسالة */
  kind: 'late_payment' | 'upcoming_due' | 'absence' | 'exam_result' | 'general' | 'renewal';
  channel: 'whatsapp' | 'sms' | 'call' | 'email';
  text: string;
  /** اتبعتت فعلاً ولا مجرد تحضير */
  sent: boolean;
  date: string;
  userId?: string;
  username?: string;
  notes?: string;
  createdAt: string;
}

/** قالب رسالة جاهز */
export interface MessageTemplate {
  id: string;
  name: string;
  kind: MessageLog['kind'];
  /** النص مع متغيرات: {student} {group} {amount} {dueDate} {center} {teacher} */
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** قائمة انتظار مجموعة مكتملة */
export interface WaitlistEntry {
  id: string;
  groupId: string;
  studentId: string;
  addedAt: string;
  /** أولوية (أصغر = أقدم/أهم) */
  priority: number;
  notes?: string;
  status: 'waiting' | 'enrolled' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
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

export interface Exam {
  id: string;
  name: string;
  groupId: string;
  date: string;
  maxGrade: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Grade {
  id: string;
  examId: string;
  studentId: string;
  grade: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'book' | 'handout' | 'other';
  costPrice: number;
  sellPrice: number;
  stock: number;
  courseId?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  type: 'in' | 'out';
  quantity: number;
  price: number;
  studentId?: string;
  date: string;
  createdAt: string;
}

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
