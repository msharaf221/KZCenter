import { openDB, IDBPDatabase } from 'idb';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import {
  Installment,
  InstallmentStatus,
  BalanceSummary,
  PricingInput,
  buildMonthlyPlan,
  applyPayment,
  computeBalance,
  creditOf,
  effectiveMonthlyPrice,
  installmentRemaining,
  installmentState,
  isCountedPayment,
  proratedFirstPeriod,
  renewalInfo,
  resolveSessionsPerMonth,
  summarize,
  RenewalInfo,
} from './billing';
import { getBillingPolicy } from './settings';
import { nextReceiptNo } from './receipts';

// ==================== INTERFACES ====================

export type StudentStatus = 'active' | 'suspended' | 'ended';
export type Gender = 'male' | 'female';
export type TeacherStatus = 'active' | 'vacation' | 'suspended';
/**
 * طريقة حساب مستحقات المدرس:
 *  - fixed      → راتب شهري ثابت
 *  - per_session→ مبلغ لكل حصة مسلَّمة (بيتحسب من أيام الحضور المسجلة)
 *  - percentage → نسبة % من المحصّل فعلياً لمجموعاته في الشهر
 *  - per_group  → مبلغ ثابت لكل مجموعة في الشهر
 */
export type TeacherPayModel = 'fixed' | 'per_session' | 'percentage' | 'per_group';
export type GroupStatus = 'open' | 'full' | 'ended';
export type PaymentStatus = 'paid' | 'pending' | 'late';
export type PaymentType = 'subscription' | 'books' | 'other';
/** طريقة القبض — مطلوبة لمطابقة الخزينة والبنك/المحفظة */
export type PaymentMethod =
  | 'cash'          // نقدي
  | 'wallet'        // محفظة (فودافون كاش / اتصالات كاش / أورنج كاش)
  | 'instapay'      // إنستاباي
  | 'card'          // فيزا/ماستركارد (POS)
  | 'bank'          // تحويل بنكي
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
  phone: string;
  email?: string;
  /** الراتب الشهري الثابت (يُستخدم مع payModel = 'fixed' أو كنسبة افتراضية) */
  salary: number;
  status: TeacherStatus;
  avatar?: string;
  notes?: string;

  // ==================== v7: مستحقات المدرس ====================
  /** طريقة الحساب — لو مش محددة بتعتبر 'fixed' (سلوك قديم) */
  payModel?: TeacherPayModel;
  /**
   * قيمة طريقة الحساب:
   *  per_session → جنيه/حصة · percentage → نسبة مئوية (0-100) · per_group → جنيه/مجموعة/شهر
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

// الأقساط/المستحقات — التعريف في src/lib/billing.ts (منطق نقي قابل للاختبار)
export type { Installment, InstallmentStatus, BalanceSummary, PricingInput, AgingBucket, UpcomingDues, RenewalInfo, RenewalState } from './billing';
export {
  installmentRemaining, installmentState, summarize, SESSIONS_PER_MONTH, renewalInfo, RENEWAL_STATE_LABEL,
  isCountedPayment, effectiveMonthlyPrice, discountBreakdown, resolveSessionsPerMonth,
  computeDueDate, sessionPrice, creditOf, debtAging, upcomingDues, daysOverdue, AGING_RANGES,
} from './billing';

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

// ==================== DB INIT ====================

const DB_NAME = 'EduCenterProDB';
/**
 * الإصدارات:
 *  6 → المتاجر الأساسية + enrollments + installments
 *  7 → audit_logs (سجل مراجعة في القاعدة بدل localStorage) · counters (ترقيم الإيصالات)
 *      refunds (استرداد) · cashbox_sessions (الخزينة/التقفيل) · payroll + teacher_advances
 *      (رواتب المدرسين) · message_logs + message_templates (تواصل أولياء الأمور)
 *      waitlist (قائمة الانتظار) + فهارس إضافية على payments
 */
const DB_VERSION = 7;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: IDBPDatabase<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDB(): Promise<IDBPDatabase<any>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      // Students
      if (!db.objectStoreNames.contains('students')) {
        const s = db.createObjectStore('students', { keyPath: 'id' });
        s.createIndex('by-status', 'status');
        s.createIndex('by-name', 'name');
        s.createIndex('by-parentPhone', 'parentPhone');
      }

      // Teachers
      if (!db.objectStoreNames.contains('teachers')) {
        const s = db.createObjectStore('teachers', { keyPath: 'id' });
        s.createIndex('by-status', 'status');
        s.createIndex('by-name', 'name');
      }

      // Courses
      if (!db.objectStoreNames.contains('courses')) {
        const s = db.createObjectStore('courses', { keyPath: 'id' });
        s.createIndex('by-name', 'name');
      }

      // Groups
      if (!db.objectStoreNames.contains('groups')) {
        const s = db.createObjectStore('groups', { keyPath: 'id' });
        s.createIndex('by-courseId', 'courseId');
        s.createIndex('by-teacherId', 'teacherId');
        s.createIndex('by-status', 'status');
      }

      // Payments
      if (!db.objectStoreNames.contains('payments')) {
        const s = db.createObjectStore('payments', { keyPath: 'id' });
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-status', 'status');
        s.createIndex('by-date', 'date');
      }

      // Attendance
      if (!db.objectStoreNames.contains('attendance')) {
        const s = db.createObjectStore('attendance', { keyPath: 'id' });
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-groupId', 'groupId');
        s.createIndex('by-date', 'date');
        s.createIndex('by-groupDate', ['groupId', 'date']);
      }

      // Users
      if (!db.objectStoreNames.contains('users')) {
        const s = db.createObjectStore('users', { keyPath: 'id' });
        s.createIndex('by-username', 'username');
      }

      // Settings
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      // Expenses
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('by-category', 'category');
        s.createIndex('by-date', 'date');
      }

      // Exams
      if (!db.objectStoreNames.contains('exams')) {
        const s = db.createObjectStore('exams', { keyPath: 'id' });
        s.createIndex('by-groupId', 'groupId');
        s.createIndex('by-date', 'date');
      }

      // Grades
      if (!db.objectStoreNames.contains('grades')) {
        const s = db.createObjectStore('grades', { keyPath: 'id' });
        s.createIndex('by-examId', 'examId');
        s.createIndex('by-studentId', 'studentId');
      }

      // Inventory
      if (!db.objectStoreNames.contains('inventory')) {
        const s = db.createObjectStore('inventory', { keyPath: 'id' });
        s.createIndex('by-type', 'type');
        s.createIndex('by-courseId', 'courseId');
      }

      // Inventory Transactions
      if (!db.objectStoreNames.contains('inventory_transactions')) {
        const s = db.createObjectStore('inventory_transactions', { keyPath: 'id' });
        s.createIndex('by-itemId', 'itemId');
        s.createIndex('by-date', 'date');
      }

      // Enrollments (Single Source of Truth for student-group relationship)
      if (!db.objectStoreNames.contains('enrollments')) {
        const s = db.createObjectStore('enrollments', { keyPath: 'id' });
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-groupId', 'groupId');
        s.createIndex('by-status', 'status');
        s.createIndex('by-studentGroup', ['studentId', 'groupId']);
      }

      // Installments (الأقساط/المستحقات — وحدة الدين الحقيقية)
      if (!db.objectStoreNames.contains('installments')) {
        const s = db.createObjectStore('installments', { keyPath: 'id' });
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-groupId', 'groupId');
        s.createIndex('by-status', 'status');
        s.createIndex('by-dueDate', 'dueDate');
        s.createIndex('by-studentGroup', ['studentId', 'groupId']);
      }

      // ==================== v7 ====================

      // سجل المراجعة — في القاعدة (مش localStorage) عشان يتنسخ ويتزامن
      if (!db.objectStoreNames.contains('audit_logs')) {
        const s = db.createObjectStore('audit_logs', { keyPath: 'id' });
        s.createIndex('by-timestamp', 'timestamp');
        s.createIndex('by-action', 'action');
        s.createIndex('by-entity', 'entity');
        s.createIndex('by-userId', 'userId');
      }

      // عدّادات تسلسلية (ترقيم الإيصالات)
      if (!db.objectStoreNames.contains('counters')) {
        db.createObjectStore('counters', { keyPath: 'id' });
      }

      // استرداد/إلغاء دفعات
      if (!db.objectStoreNames.contains('refunds')) {
        const s = db.createObjectStore('refunds', { keyPath: 'id' });
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-date', 'date');
        s.createIndex('by-paymentId', 'paymentId');
      }

      // الخزينة: ورديات/تقفيل يومي
      if (!db.objectStoreNames.contains('cashbox_sessions')) {
        const s = db.createObjectStore('cashbox_sessions', { keyPath: 'id' });
        s.createIndex('by-status', 'status');
        s.createIndex('by-openedAt', 'openedAt');
        s.createIndex('by-date', 'date');
      }

      // رواتب المدرسين
      if (!db.objectStoreNames.contains('payroll')) {
        const s = db.createObjectStore('payroll', { keyPath: 'id' });
        s.createIndex('by-teacherId', 'teacherId');
        s.createIndex('by-period', 'period');
        s.createIndex('by-teacherPeriod', ['teacherId', 'period']);
        s.createIndex('by-status', 'status');
      }

      // سلف/عهدة المدرسين
      if (!db.objectStoreNames.contains('teacher_advances')) {
        const s = db.createObjectStore('teacher_advances', { keyPath: 'id' });
        s.createIndex('by-teacherId', 'teacherId');
        s.createIndex('by-date', 'date');
      }

      // تواصل أولياء الأمور (سجل مراسلات)
      if (!db.objectStoreNames.contains('message_logs')) {
        const s = db.createObjectStore('message_logs', { keyPath: 'id' });
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-date', 'date');
        s.createIndex('by-channel', 'channel');
      }

      // قوالب الرسائل
      if (!db.objectStoreNames.contains('message_templates')) {
        const s = db.createObjectStore('message_templates', { keyPath: 'id' });
        s.createIndex('by-kind', 'kind');
      }

      // قائمة الانتظار للمجموعات المكتملة
      if (!db.objectStoreNames.contains('waitlist')) {
        const s = db.createObjectStore('waitlist', { keyPath: 'id' });
        s.createIndex('by-groupId', 'groupId');
        s.createIndex('by-studentId', 'studentId');
        s.createIndex('by-groupStudent', ['groupId', 'studentId']);
      }

      // ==================== فهارس مضافة لمتاجر موجودة ====================
      // (المتاجر القديمة مش هتدخل بلوك الإنشاء فوق، فلازم نضيف الفهارس صراحة)
      const ensureIndex = (
        store: string,
        name: string,
        keyPath: string | string[],
      ) => {
        if (!db.objectStoreNames.contains(store)) return;
        const s = tx.objectStore(store);
        if (!s.indexNames.contains(name)) s.createIndex(name, keyPath);
      };

      // ربحية المجموعات + تقفيل الخزينة بيستعلموا بالدفعات حسب المجموعة/التاريخ
      ensureIndex('payments', 'by-groupId', 'groupId');
      ensureIndex('payments', 'by-type', 'type');
      ensureIndex('payments', 'by-collectedBy', 'collectedBy');
      ensureIndex('expenses', 'by-teacherId', 'teacherId');
      ensureIndex('students', 'by-updatedAt', 'updatedAt');
    },
  });

  return dbInstance;
}

// ==================== SEED DATA ====================

export async function seedDefaultData(): Promise<void> {
  const db = await getDB();

  const users = await db.getAll('users');

  if (users.length === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    const adminUser: User = {
      id: generateId(),
      username: 'admin',
      passwordHash,
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.add('users', adminUser);
  }

  const settings = await db.get('settings', 'main');
  if (!settings) {
    const defaultSettings: Settings = {
      id: 'main',
      centerName: 'EduCenter Pro',
      address: '',
      phone: '',
      email: '',
      academicYear: '2024-2025',
      currency: 'EGP',
      primaryColor: '#6366f1',
      fontSize: 'md',
      darkMode: false,
      notifyNewStudent: true,
      notifyAbsence: true,
      notifyLatePayment: true,
    };
    await db.put('settings', defaultSettings);
  }
}

// ==================== UTILS ====================

export function generateId(): string {
  // crypto.randomUUID is collision-safe (unlike Date.now + Math.random)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// ==================== GENERIC CRUD ====================

type StoreName =
  | 'students' | 'teachers' | 'courses' | 'groups'
  | 'payments' | 'attendance' | 'users' | 'settings'
  | 'expenses' | 'exams' | 'grades'
  | 'inventory' | 'inventory_transactions'
  | 'enrollments' | 'installments'
  // v7
  | 'audit_logs' | 'counters' | 'refunds' | 'cashbox_sessions'
  | 'payroll' | 'teacher_advances' | 'message_logs' | 'message_templates'
  | 'waitlist';

export type { StoreName };

export interface DbGetAllOptions {
  /** رجّع الصفوف المحذوفة كمان (لسلة المحذوفات) */
  includeDeleted?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- الافتراضي any عشان النداءات من غير generic تفضل شغالة
export async function dbGetAll<T = any>(storeName: StoreName, opts: DbGetAllOptions = {}): Promise<T[]> {
  try {
    const db = await getDB();
    const all: T[] = await db.getAll(storeName);
    if (opts.includeDeleted) return all;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return all.filter((item: any) => !item.deleted);
  } catch (e) {
    console.error(`dbGetAll(${storeName}) error:`, e);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbGetById<T = any>(storeName: StoreName, id: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    const item = await db.get(storeName, id) as (T & { deleted?: boolean }) | undefined;
    // Never return soft-deleted records (consistent with dbGetAll / dbGetPaginated)
    if (item && (item as { deleted?: boolean }).deleted) return undefined;
    return item as T | undefined;
  } catch (e) {
    console.error(`dbGetById(${storeName}) error:`, e);
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbAdd<T = any>(storeName: StoreName, item: T): Promise<void> {
  try {
    const db = await getDB();
    await db.add(storeName, item);
  } catch (e) {
    console.error(`dbAdd(${storeName}) error:`, e);
    throw e;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbPut<T = any>(storeName: StoreName, item: T): Promise<void> {
  try {
    const db = await getDB();
    await db.put(storeName, item);
  } catch (e) {
    console.error(`dbPut(${storeName}) error:`, e);
    throw e;
  }
}

export interface SoftDeleteMeta {
  /** المستخدم اللي حذف (يظهر في سلة المحذوفات) */
  deletedBy?: string;
  reason?: string;
}

export async function dbSoftDelete(storeName: StoreName, id: string, meta: SoftDeleteMeta = {}): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await dbGetById<any>(storeName, id);
    if (item) {
      const now = new Date().toISOString();
      await dbPut(storeName, {
        ...item,
        deleted: true,
        deletedAt: now,
        deletedBy: meta.deletedBy,
        deleteReason: meta.reason,
        updatedAt: now,
      });
    }
  } catch (e) {
    console.error(`dbSoftDelete(${storeName}) error:`, e);
    throw e;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbBulkAdd<T = any>(storeName: StoreName, items: T[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(storeName, 'readwrite');
    for (const item of items) {
      await tx.store.put(item);
    }
    await tx.done;
  } catch (e) {
    console.error(`dbBulkAdd(${storeName}) error:`, e);
    throw e;
  }
}

export async function dbClearStore(storeName: StoreName): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(storeName);
  } catch (e) {
    console.error(`dbClearStore(${storeName}) error:`, e);
    throw e;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbGetPaginated<T = any>(
  storeName: StoreName,
  page: number,
  pageSize: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterFn?: (item: any) => boolean
): Promise<{ items: T[]; total: number }> {
  try {
    const db = await getDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = await db.getAll(storeName);
    const filtered = all.filter(item => {
      if (item.deleted) return false;
      if (filterFn) return filterFn(item);
      return true;
    });
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize) as T[];
    return { items, total };
  } catch (e) {
    console.error(`dbGetPaginated(${storeName}) error:`, e);
    return { items: [], total: 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbGetByIndex<T = any>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  try {
    const db = await getDB();
    const all: T[] = await db.getAllFromIndex(storeName, indexName, value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return all.filter((item: any) => !item.deleted);
  } catch (e) {
    console.error(`dbGetByIndex(${storeName}, ${indexName}) error:`, e);
    return [];
  }
}

// ==================== ENROLLMENT MANAGEMENT ====================

/**
 * تسجيل طالب في مجموعة (Atomic Operation)
 * يضمن التزامن بين enrollments و student.enrolledGroups و group.studentIds
 *
 * @param initialPayment الدفعة الأولى (اختياري)
 * @param opts.startSession رقم الحصة اللي التحق منها (للالتحاق في نص الكورس) —
 *        بيخلّي القسط الأول محسوب على الحصص الباقية بس
 */
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

export async function enrollStudent(
  studentId: string,
  groupId: string,
  initialPayment?: number,
  opts?: EnrollOptions
): Promise<{ success: boolean; error?: string; enrollmentId?: string; monthlyPrice?: number }> {
  try {
    // 1. Validate
    const [student, group] = await Promise.all([
      dbGetById<Student>('students', studentId),
      dbGetById<Group>('groups', groupId),
    ]);

    if (!student) return { success: false, error: 'الطالب غير موجود' };
    if (!group) return { success: false, error: 'المجموعة غير موجودة' };
    if (group.status === 'ended') return { success: false, error: 'المجموعة منتهية' };
    if (group.status === 'full') return { success: false, error: 'المجموعة مكتملة' };

    // 2. Check if already enrolled
    const existingEnrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, groupId]);
    const activeEnrollment = existingEnrollments.find(e => e.status === 'active' && !e.deleted);
    if (activeEnrollment) {
      return { success: false, error: 'الطالب مسجل بالفعل في هذه المجموعة' };
    }

    // 3. Check capacity
    if (group.studentIds.length >= group.maxStudents) {
      return { success: false, error: 'المجموعة مكتملة' };
    }

    // 4. Create enrollment record (Single Source of Truth)
    const enrollmentId = generateId();
    const now = new Date().toISOString();
    const startSession = opts?.startSession && opts.startSession > 1 ? opts.startSession : undefined;

    const course = await dbGetById<Course>('courses', group.courseId);
    const policy = await getBillingPolicy();

    // التسعير الفعلي: سعر خاص → خصم نسبة → خصم مبلغ
    const pricing: PricingInput = {
      coursePrice: course?.price || 0,
      priceOverride: opts?.priceOverride,
      discountAmount: opts?.discountAmount,
      discountPercent: opts?.discountPercent,
    };
    const monthlyPrice = effectiveMonthlyPrice(pricing);

    const enrollment: Enrollment = {
      id: enrollmentId,
      studentId,
      groupId,
      status: 'active',
      enrolledAt: now,
      startSession,
      initialPayment: initialPayment || 0,
      priceOverride: opts?.priceOverride,
      discountAmount: opts?.discountAmount,
      discountPercent: opts?.discountPercent,
      discountReason: opts?.discountReason,
      isTrial: opts?.isTrial,
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('enrollments', enrollment);

    // 4b. توليد خطة الأقساط الشهرية لهذا التسجيل (المستحقات الحقيقية على الطالب)
    // عدد الحصص الفعلي في الشهر بيحدد تناسب الالتحاق في نص الكورس
    const sessionsPerMonth = resolveSessionsPerMonth({
      courseSessionsPerMonth: course?.sessionsPerMonth,
      settingSessionsPerMonth: policy.sessionsPerMonth,
    });

    // النظام شهر بشهر: التسجيل بيفتح شهر واحد بس، والشهر اللي بعده بالتجديد
    const plan = buildMonthlyPlan({
      ...pricing,
      durationMonths: 1,
      startDate: now,
      dueDayOfMonth: policy.dueDayOfMonth,
      graceDays: policy.graceDays,
      // الالتحاق في نص الكورس: الشهر الأول يتحسب على الحصص الباقية بس
      firstPeriodAmount: startSession
        ? proratedFirstPeriod(monthlyPrice, startSession, sessionsPerMonth)
        : undefined,
    });
    const createdInstallments: Installment[] = plan.map(p => ({
      id: generateId(),
      studentId,
      groupId,
      enrollmentId,
      periodIndex: p.periodIndex,
      periodLabel: p.periodLabel,
      amount: p.amount,
      paidAmount: 0,
      dueDate: p.dueDate,
      status: 'pending' as InstallmentStatus,
      createdAt: now,
      updatedAt: now,
    }));

    // 5. Update denormalized arrays (for performance)
    await dbPut('groups', {
      ...group,
      studentIds: [...new Set([...group.studentIds, studentId])],
      updatedAt: now,
    });

    await dbPut('students', {
      ...student,
      enrolledGroups: [...new Set([...student.enrolledGroups, groupId])],
      updatedAt: now,
    });

    // 6. حفظ خطة الأقساط، ثم تسجيل الدفعة الأولى (لو فيه)
    await dbBulkAdd('installments', createdInstallments);

    if (initialPayment && initialPayment > 0) {
      const paymentDate = now.split('T')[0];
      const receiptNo = await nextReceiptNo(paymentDate, policy.receiptPrefix);
      await dbAdd('payments', {
        id: generateId(),
        studentId,
        courseId: group.courseId,
        groupId,
        amount: initialPayment,
        date: paymentDate,
        type: 'subscription',
        status: 'paid',
        installmentIds: [],
        method: opts?.paymentMethod || 'cash',
        collectedBy: opts?.collectedBy,
        collectedByName: opts?.collectedByName,
        receiptNo,
        notes: `تسجيل في ${group.name}`,
        createdAt: now,
        updatedAt: now,
      } satisfies Payment);
    }

    // 7. Sync group status
    await syncGroupStatus(groupId);

    // 8. توزيع الدفعات على الأقساط + إعادة حساب أرصدة الطالب
    await rebuildInstallmentsFromPayments(studentId);

    return { success: true, enrollmentId, monthlyPrice };
  } catch (error) {
    console.error('enrollStudent error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * إزالة طالب من مجموعة (Atomic Operation)
 */
export async function unenrollStudent(
  studentId: string,
  groupId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Find active enrollment
    const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, groupId]);
    const activeEnrollment = enrollments.find(e => e.status === 'active' && !e.deleted);
    
    if (!activeEnrollment) {
      return { success: false, error: 'الطالب غير مسجل في هذه المجموعة' };
    }

    // 2. Update enrollment status
    const now = new Date().toISOString();
    await dbPut('enrollments', {
      ...activeEnrollment,
      status: 'dropped',
      droppedAt: now,
      dropReason: reason || 'إزالة يدوية',
      updatedAt: now,
    });

    // 3. Update denormalized arrays
    const [student, group] = await Promise.all([
      dbGetById<Student>('students', studentId),
      dbGetById<Group>('groups', groupId),
    ]);

    // 3b. إلغاء الأقساط غير المسددة لهذا التسجيل (الدين بيروح مع الخروج من المجموعة،
    //     لكن اللي اتدفع فعلاً يفضل مسجّل كمدفوع)
    const groupInstallments = await dbGetByIndex<Installment>('installments', 'by-studentGroup', [studentId, groupId]);
    for (const inst of groupInstallments) {
      if (inst.status === 'cancelled') continue;
      if (installmentRemaining(inst) > 0) {
        await dbPut('installments', {
          ...inst,
          status: 'cancelled' as InstallmentStatus,
          notes: inst.notes ? `${inst.notes} — ${reason || 'إزالة'}` : `ملغي: ${reason || 'إزالة من المجموعة'}`,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (student) {
      await dbPut('students', {
        ...student,
        enrolledGroups: student.enrolledGroups.filter(gid => gid !== groupId),
        updatedAt: now,
      });
    }

    if (group) {
      await dbPut('groups', {
        ...group,
        studentIds: group.studentIds.filter(sid => sid !== studentId),
        updatedAt: now,
      });
      await syncGroupStatus(groupId);
    }

    // 4. Recalculate student totals
    await recalculateStudentTotalPaid(studentId);

    return { success: true };
  } catch (error) {
    console.error('unenrollStudent error:', error);
    return { success: false, error: String(error) };
  }
}

// ==================== RENEWAL (تجديد / استكمال الاشتراك) ====================

export interface RenewOptions {
  studentId: string;
  groupId: string;
  /** عدد الشهور الجديدة (افتراضي: شهر واحد) */
  months?: number;
  /** بداية الأقساط الجديدة YYYY-MM-DD (افتراضي: بعد آخر قسط، أو النهاردة لو الاشتراك منتهي) */
  startDate?: string;
  /** دفعة عند التجديد (اختياري) */
  initialPayment?: number;
  paymentMethod?: PaymentMethod;
  collectedBy?: string;
  collectedByName?: string;
  /** تسعير مختلف عن التسجيل الأصلي (لو فاضي بيستخدم نفس السعر/الخصم المتفق عليه) */
  priceOverride?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
  notes?: string;
  userId?: string;
  username?: string;
}

export interface RenewResult {
  success: boolean;
  error?: string;
  /** عدد الأقساط اللي اتضافت */
  installmentsCreated?: number;
  /** رقم الدورة (1 = أول تجديد) */
  cycle?: number;
  monthlyPrice?: number;
  /** أول وآخر استحقاق في الخطة الجديدة */
  firstDueDate?: string;
  lastDueDate?: string;
  remainingAfter?: number;
}

/**
 * تجديد/استكمال اشتراك طالب في مجموعة **من غير ما يخرج ويدخل تاني**.
 *
 * الفرق عن `enrollStudent`: التسجيل نفسه بيفضل موجود (بتاريخه وخصوماته وسجل حضوره)،
 * وبنضيف بس دورة جديدة من الأقساط تكمّل الترقيم بعد الخطة القديمة.
 * - لو عليه متبقي من الدورة القديمة بيفضل زي ما هو (ما بيتلغيش ولا بيتنقل).
 * - لو الطالب كان `ended` أو `suspended` بيرجع `active` تلقائياً.
 * - لو التسجيل كان `completed`/`dropped` (خرج قبل كده) بيتعاد تفعيله.
 */
export async function renewEnrollment(opts: RenewOptions): Promise<RenewResult> {
  try {
    const { studentId, groupId } = opts;
    const [student, group] = await Promise.all([
      dbGetById<Student>('students', studentId),
      dbGetById<Group>('groups', groupId),
    ]);
    if (!student) return { success: false, error: 'الطالب غير موجود' };
    if (!group) return { success: false, error: 'المجموعة غير موجودة' };
    if (group.status === 'ended') return { success: false, error: 'المجموعة منتهية — حوّل الطالب لمجموعة تانية بدل التجديد' };

    const course = await dbGetById<Course>('courses', group.courseId);
    const months = Math.max(1, Math.floor(opts.months || 1));

    // التسجيل: النشط، وإلا آخر تسجيل (مكتمل/خارج) نعيد تفعيله
    const enrollments = (await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, groupId]))
      .filter(e => !e.deleted)
      .sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));
    let enrollment = enrollments.find(e => e.status === 'active');
    let reactivated = false;
    if (!enrollment) {
      const previous = enrollments.find(e => e.status === 'completed' || e.status === 'dropped');
      if (!previous) return { success: false, error: 'الطالب غير مسجل في هذه المجموعة — سجّله الأول' };
      // إعادة تفعيل تسجيل قديم بتحتاج مكان في المجموعة
      if (!group.studentIds.includes(studentId) && group.studentIds.length >= group.maxStudents) {
        return { success: false, error: `المجموعة مكتملة (${group.studentIds.length}/${group.maxStudents})` };
      }
      enrollment = previous;
      reactivated = true;
    }

    const now = new Date().toISOString();
    const today = dayjs().format('YYYY-MM-DD');
    const policy = await getBillingPolicy();

    // الأقساط الحالية → نحدد آخر رقم وآخر استحقاق
    const existing = (await dbGetByIndex<Installment>('installments', 'by-studentGroup', [studentId, groupId]))
      .filter(i => !i.deleted);
    const info = renewalInfo(existing, today, 0);
    const startDate = (opts.startDate && dayjs(opts.startDate).isValid())
      ? dayjs(opts.startDate).format('YYYY-MM-DD')
      : info.nextStartDate;

    // التسعير: لو المستخدم حدد سعر/خصم جديد نستخدمه، وإلا نكمّل بنفس اتفاق التسجيل الأصلي
    const pricing: PricingInput = {
      coursePrice: course?.price || 0,
      priceOverride: opts.priceOverride ?? enrollment.priceOverride,
      discountAmount: opts.discountAmount ?? enrollment.discountAmount,
      discountPercent: opts.discountPercent ?? enrollment.discountPercent,
    };
    const monthlyPrice = effectiveMonthlyPrice(pricing);
    const cycle = (enrollment.renewalCount || 0) + 1;

    const plan = buildMonthlyPlan({
      ...pricing,
      durationMonths: months,
      startDate,
      dueDayOfMonth: policy.dueDayOfMonth,
      graceDays: policy.graceDays,
      startPeriodIndex: info.lastPeriodIndex + 1,
      labelPrefix: `تجديد ${cycle}`,
    });
    const created: Installment[] = plan.map(p => ({
      id: generateId(),
      studentId,
      groupId,
      enrollmentId: enrollment!.id,
      periodIndex: p.periodIndex,
      periodLabel: p.periodLabel,
      amount: p.amount,
      paidAmount: 0,
      dueDate: p.dueDate,
      status: 'pending' as InstallmentStatus,
      notes: opts.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }));
    await dbBulkAdd('installments', created);

    // تحديث التسجيل (سجل التجديد + إعادة التفعيل لو لزم)
    const renewal: EnrollmentRenewal = {
      cycle,
      at: now,
      startDate,
      months,
      monthlyPrice,
      initialPayment: opts.initialPayment || 0,
      byUserId: opts.userId,
      byUsername: opts.username,
      notes: opts.notes?.trim() || undefined,
    };
    await dbPut('enrollments', {
      ...enrollment,
      status: 'active',
      droppedAt: reactivated ? undefined : enrollment.droppedAt,
      dropReason: reactivated ? undefined : enrollment.dropReason,
      renewalCount: cycle,
      renewedAt: now,
      renewals: [...(enrollment.renewals || []), renewal],
      priceOverride: pricing.priceOverride ?? undefined,
      discountAmount: pricing.discountAmount ?? undefined,
      discountPercent: pricing.discountPercent ?? undefined,
      discountReason: opts.discountReason ?? enrollment.discountReason,
      updatedAt: now,
    } satisfies Enrollment);

    // المصفوفات المكررة + حالة الطالب
    if (!group.studentIds.includes(studentId)) {
      await dbPut('groups', { ...group, studentIds: [...group.studentIds, studentId], updatedAt: now });
      await syncGroupStatus(groupId);
    }
    const enrolledGroups = [...new Set([...(student.enrolledGroups || []), groupId])];
    if (student.status !== 'active' || enrolledGroups.length !== (student.enrolledGroups || []).length) {
      await dbPut('students', { ...student, status: 'active', enrolledGroups, updatedAt: now });
    }

    // دفعة التجديد (لو فيه)
    if (opts.initialPayment && opts.initialPayment > 0) {
      const receiptNo = await nextReceiptNo(today, policy.receiptPrefix);
      await dbAdd('payments', {
        id: generateId(),
        studentId,
        courseId: group.courseId,
        groupId,
        amount: opts.initialPayment,
        date: today,
        type: 'subscription',
        status: 'paid',
        installmentIds: [],
        method: opts.paymentMethod || 'cash',
        collectedBy: opts.collectedBy,
        collectedByName: opts.collectedByName,
        receiptNo,
        notes: `تجديد اشتراك — ${group.name}`,
        createdAt: now,
        updatedAt: now,
      } satisfies Payment);
    }

    await rebuildInstallmentsFromPayments(studentId);
    const after = await getStudentBalance(studentId);

    return {
      success: true,
      installmentsCreated: created.length,
      cycle,
      monthlyPrice,
      firstDueDate: created[0]?.dueDate,
      lastDueDate: created[created.length - 1]?.dueDate,
      remainingAfter: Math.max(0, after?.remaining ?? 0),
    };
  } catch (error) {
    console.error('renewEnrollment error:', error);
    return { success: false, error: String(error) };
  }
}

export interface RenewalCandidate {
  studentId: string;
  studentName: string;
  parentPhone: string;
  phone?: string;
  groupId: string;
  groupName: string;
  courseName: string;
  teacherName: string;
  info: RenewalInfo;
  /** المتبقي على المجموعة دي */
  remaining: number;
}

/**
 * الاشتراكات اللي قربت تنتهي أو انتهت (لكل تسجيل نشط) — عشان السكرتارية تكلم أولياء الأمور قبل ما الطالب يقطع.
 */
export async function getRenewalCandidates(daysAhead: number = 7): Promise<RenewalCandidate[]> {
  const [enrollments, students, groups, courses, teachers, installments] = await Promise.all([
    dbGetAll<Enrollment>('enrollments'),
    dbGetAll<Student>('students'),
    dbGetAll<Group>('groups'),
    dbGetAll<Course>('courses'),
    dbGetAll<Teacher>('teachers'),
    dbGetAll<Installment>('installments'),
  ]);
  const today = dayjs().format('YYYY-MM-DD');
  const byPair = new Map<string, Installment[]>();
  for (const i of installments) {
    const k = `${i.studentId}|${i.groupId}`;
    const l = byPair.get(k);
    if (l) l.push(i); else byPair.set(k, [i]);
  }

  const out: RenewalCandidate[] = [];
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    const student = students.find(s => s.id === e.studentId);
    const group = groups.find(g => g.id === e.groupId);
    if (!student || !group || group.status === 'ended') continue;
    if (student.status === 'ended') continue;
    const list = byPair.get(`${e.studentId}|${e.groupId}`) || [];
    if (list.length === 0) continue; // من غير أقساط ما نقدرش نحكم
    const info = renewalInfo(list, today, daysAhead);
    if (info.state === 'active') continue;
    const s = summarize(list, today);
    out.push({
      studentId: student.id,
      studentName: student.name,
      parentPhone: student.parentPhone,
      phone: student.phone,
      groupId: group.id,
      groupName: group.name,
      courseName: courses.find(c => c.id === group.courseId)?.name || '—',
      teacherName: teachers.find(t => t.id === group.teacherId)?.name || '—',
      info,
      remaining: s.remaining,
    });
  }
  // المنتهي الأقدم الأول، وبعده اللي قرب ينتهي
  return out.sort((a, b) => (a.info.daysLeft ?? 0) - (b.info.daysLeft ?? 0));
}

// ==================== TRANSFER (تحويل بين المجموعات/المدرسين) ====================

export interface TransferResult {
  success: boolean;
  error?: string;
  /** اللي كان مدفوع في المجموعة القديمة = الرصيد المرحّل */
  credit?: number;
  /** المتبقي على الطالب قبل التحويل */
  remainingBefore?: number;
  /** المتبقي على الطالب بعد التحويل */
  remainingAfter?: number;
}

/**
 * تحويل طالب من مجموعة لمجموعة (أو من مدرس لمدرس) في عملية واحدة ذرّية.
 *
 * - التعليم القديم بيتحوّل لـ `transferred` مع التاريخ والسبب والمجموعة الهدف
 * - كل أقساط المجموعة القديمة بتتلغي، فالفلوس المدفوعة تترحل كرصيد للمجموعة
 *   الجديدة تلقائياً (عن طريق إعادة بناء المدفوع)، وأي فرق في السعر يظهر كمتبقي
 * - بتتولّد خطة أقساط جديدة في المجموعة الهدف (مع دعم الالتحاق من حصة معينة)
 */
export async function transferStudent(opts: {
  studentId: string;
  fromGroupId: string;
  toGroupId: string;
  startSession?: number;
  reason?: string;
}): Promise<TransferResult> {
  const { studentId, fromGroupId, toGroupId } = opts;

  if (fromGroupId === toGroupId) {
    return { success: false, error: 'المجموعة الجديدة هي نفسها المجموعة الحالية' };
  }

  const [student, fromGroup, toGroup] = await Promise.all([
    dbGetById<Student>('students', studentId),
    dbGetById<Group>('groups', fromGroupId),
    dbGetById<Group>('groups', toGroupId),
  ]);
  if (!student) return { success: false, error: 'الطالب غير موجود' };
  if (!fromGroup) return { success: false, error: 'المجموعة الحالية غير موجودة' };
  if (!toGroup) return { success: false, error: 'المجموعة الجديدة غير موجودة' };
  if (toGroup.status === 'ended') return { success: false, error: 'المجموعة الجديدة منتهية' };
  if (toGroup.studentIds.length >= toGroup.maxStudents) {
    return { success: false, error: `المجموعة الجديدة مكتملة (${toGroup.studentIds.length}/${toGroup.maxStudents})` };
  }

  const fromEnrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, fromGroupId]);
  const activeFrom = fromEnrollments.find(e => e.status === 'active' && !e.deleted);
  if (!activeFrom) return { success: false, error: 'الطالب غير مسجل في المجموعة الحالية' };

  const toEnrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, toGroupId]);
  if (toEnrollments.some(e => e.status === 'active' && !e.deleted)) {
    return { success: false, error: 'الطالب مسجل بالفعل في المجموعة الجديدة' };
  }

  const before = await getStudentBalance(studentId);
  const remainingBefore = before?.remaining ?? 0;
  const now = new Date().toISOString();

  // 1) الرصيد المرحّل = اللي مدفوع فعلاً في أقساط المجموعة القديمة
  const oldInstallments = await dbGetByIndex<Installment>('installments', 'by-studentGroup', [studentId, fromGroupId]);
  const credit = oldInstallments
    .filter(i => i.status !== 'cancelled')
    .reduce((sum, i) => sum + (i.paidAmount || 0), 0);

  // 2) إلغاء كل أقساط المجموعة القديمة (فالمدفوع يترحل كرصيد للمجموعة الجديدة)
  for (const inst of oldInstallments) {
    if (inst.status === 'cancelled') continue;
    await dbPut('installments', {
      ...inst,
      status: 'cancelled' as InstallmentStatus,
      notes: `ملغي: تحويل إلى ${toGroup.name}`,
      updatedAt: now,
    });
  }

  // 3) التعليم القديم → transferred (سجل التحويل)
  await dbPut('enrollments', {
    ...activeFrom,
    status: 'transferred',
    droppedAt: now,
    dropReason: opts.reason || `تحويل إلى ${toGroup.name}`,
    transferredToGroupId: toGroupId,
    updatedAt: now,
  });

  // 4) تسجيل جديد + خطة أقساط في المجموعة الجديدة
  const startSession = opts.startSession && opts.startSession > 1 ? opts.startSession : undefined;
  const newEnrollment: Enrollment = {
    id: generateId(),
    studentId,
    groupId: toGroupId,
    status: 'active',
    enrolledAt: now,
    startSession,
    initialPayment: 0,
    notes: `محوّل من ${fromGroup.name}`,
    createdAt: now,
    updatedAt: now,
  };
  await dbAdd('enrollments', newEnrollment);

  const course = await dbGetById<Course>('courses', toGroup.courseId);
  const transferPolicy = await getBillingPolicy();
  const toSessionsPerMonth = resolveSessionsPerMonth({
    courseSessionsPerMonth: course?.sessionsPerMonth,
    settingSessionsPerMonth: transferPolicy.sessionsPerMonth,
  });
  // شهر واحد في المجموعة الجديدة (نفس قاعدة التسجيل) — ولو دخل من نص الشهر يتحاسب على الحصص الباقية
  const plan = buildMonthlyPlan({
    coursePrice: course?.price || 0,
    durationMonths: 1,
    startDate: now,
    firstPeriodAmount: startSession && course ? proratedFirstPeriod(course.price, startSession, toSessionsPerMonth) : undefined,
  });
  await dbBulkAdd<Installment>('installments', plan.map(p => ({
    id: generateId(),
    studentId,
    groupId: toGroupId,
    enrollmentId: newEnrollment.id,
    periodIndex: p.periodIndex,
    periodLabel: p.periodLabel,
    amount: p.amount,
    paidAmount: 0,
    dueDate: p.dueDate,
    status: 'pending' as InstallmentStatus,
    notes: `محوّل من ${fromGroup.name}`,
    createdAt: now,
    updatedAt: now,
  })));

  // 5) تحديث القوائم وحالة المجموعتين
  await dbPut('groups', {
    ...fromGroup,
    studentIds: fromGroup.studentIds.filter(sid => sid !== studentId),
    updatedAt: now,
  });
  await dbPut('groups', {
    ...toGroup,
    studentIds: [...new Set([...toGroup.studentIds, studentId])],
    updatedAt: now,
  });
  await dbPut('students', {
    ...student,
    enrolledGroups: [
      ...new Set([...(student.enrolledGroups || []).filter(gid => gid !== fromGroupId), toGroupId]),
    ],
    updatedAt: now,
  });
  await syncGroupStatus(fromGroupId);
  await syncGroupStatus(toGroupId);

  // 6) ترحيل الدفعة غير المُستهلكة من المجموعة القديمة إلى الجديدة.
  //    أقساط القديمة ملغاة؛ أي مبلغ دُفع ولم يُستهلك (الرصيد المرحّل credit)
  //    يجب أن يغطّي شهر المجموعة الجديدة، وإلا الطالب يظهر مديناً رغم دفعه.
  //    ننقل الدفعة الاشتراكية الأقدم فالأحدث حتى نُغطّي مبلغ الترحيل،
  //    ونربطها بالمجموعة الجديدة مع مذكرة تتبّع للمراجعة.
  const allPayments = await dbGetByIndex<Payment>('payments', 'by-studentId', studentId);
  const oldSubPayments = allPayments
    .filter(p => isCountedPayment(p) && p.type === 'subscription' && p.groupId === fromGroupId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  let toRelocate = Math.round(credit * 100) / 100;
  for (const p of oldSubPayments) {
    if (toRelocate <= 0) break;
    await dbPut('payments', {
      ...p,
      groupId: toGroupId,
      courseId: toGroup.courseId,
      notes: p.notes
        ? `${p.notes} — مُرحّلة من ${fromGroup.name} إلى ${toGroup.name}`
        : `مرحّلة من ${fromGroup.name} إلى ${toGroup.name}`,
      installmentIds: [],
      updatedAt: now,
    });
    toRelocate = Math.round((toRelocate - (p.amount || 0)) * 100) / 100;
  }

  // 7) إعادة توزيع المدفوع على الأقساط الجديدة + تحديث أرصدة الطالب
  await rebuildInstallmentsFromPayments(studentId);

  const after = await getStudentBalance(studentId);
  return { success: true, credit, remainingBefore, remainingAfter: after?.remaining ?? 0 };
}

export interface TransferRecord {
  id: string;
  fromGroupId: string;
  fromGroupName: string;
  toGroupId?: string;
  toGroupName: string;
  date: string;
  reason?: string;
}

/** سجل تحويلات الطالب (من تعليمات الحالة transferred) */
export async function getTransferHistory(studentId: string): Promise<TransferRecord[]> {
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', studentId);
  const transfers = enrollments.filter(e => !e.deleted && e.status === 'transferred');
  if (transfers.length === 0) return [];

  const groups = await dbGetAll<Group>('groups');
  const nameOf = (gid?: string) => (gid ? groups.find(g => g.id === gid)?.name || 'مجموعة محذوفة' : '—');

  return transfers
    .slice()
    .sort((a, b) => (b.droppedAt || '').localeCompare(a.droppedAt || ''))
    .map(e => ({
      id: e.id,
      fromGroupId: e.groupId,
      fromGroupName: nameOf(e.groupId),
      toGroupId: e.transferredToGroupId,
      toGroupName: nameOf(e.transferredToGroupId),
      date: e.droppedAt || e.updatedAt,
      reason: e.dropReason,
    }));
}

/**
 * جلب كل الطلاب المسجلين في مجموعة
 */
export async function getGroupStudents(groupId: string): Promise<Student[]> {
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-groupId', groupId);
  const activeStudentIds = enrollments
    .filter(e => e.status === 'active' && !e.deleted)
    .map(e => e.studentId);

  const students: Student[] = [];
  for (const sid of activeStudentIds) {
    const student = await dbGetById<Student>('students', sid);
    if (student && !student.deleted) {
      students.push(student);
    }
  }
  return students;
}

// ==================== BILLING / INSTALLMENTS ====================

export interface GroupBalance {
  groupId: string;
  groupName: string;
  courseName: string;
  owed: number;
  paid: number;
  remaining: number;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  installments: Installment[];
}

export interface StudentBalance extends BalanceSummary {
  studentId: string;
  studentName: string;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  /** رصيد دائن لصالح الطالب (دفع أكتر من المستحق) — بيظهر في ملفه وفي التحصيل */
  credit: number;
  /** إجمالي الاستردادات */
  refunded: number;
  groups: GroupBalance[];
}

export interface DebtorRow {
  studentId: string;
  name: string;
  parentPhone: string;
  phone?: string;
  status: StudentStatus;
  owed: number;
  paid: number;
  remaining: number;
  unpaidCount: number;
  overdueCount: number;
  overdueAmount: number;
  groups: { groupId: string; groupName: string; courseName: string; remaining: number }[];
  lastPaymentDate?: string;
  /** عدد الأيام من آخر دفعة (null لو ما دفعش خالص) */
  daysSinceLastPayment: number | null;
}

/**
 * قائمة المديونيات: كل الطلاب اللي عليهم متبقي (ما عدا المنتهيين)،
 * مرتبين من الأكبر متبقياً للأصغر.
 */
export async function getDebtors(): Promise<DebtorRow[]> {
  const [students, payments] = await Promise.all([
    dbGetAll<Student>('students'),
    dbGetAll<Payment>('payments'),
  ]);

  const today = dayjs();
  const rows: DebtorRow[] = [];

  for (const s of students) {
    if (s.status === 'ended') continue;
    const balance = await getStudentBalance(s.id);
    if (!balance || balance.remaining <= 0) continue;

    const lastPaymentDate = payments
      .filter(p => !p.deleted && p.studentId === s.id && p.status === 'paid')
      .map(p => p.date)
      .sort()
      .pop();

    rows.push({
      studentId: s.id,
      name: s.name,
      parentPhone: s.parentPhone,
      phone: s.phone,
      status: s.status,
      owed: balance.owed,
      paid: balance.paid,
      remaining: balance.remaining,
      unpaidCount: balance.unpaidCount,
      overdueCount: balance.overdueCount,
      overdueAmount: balance.overdueAmount,
      groups: balance.groups
        .filter(g => g.remaining > 0)
        .map(g => ({ groupId: g.groupId, groupName: g.groupName, courseName: g.courseName, remaining: g.remaining })),
      lastPaymentDate,
      daysSinceLastPayment: lastPaymentDate ? today.diff(dayjs(lastPaymentDate), 'day') : null,
    });
  }

  return rows.sort((a, b) => b.remaining - a.remaining);
}

export interface PaymentResult {
  success: boolean;
  error?: string;
  payment?: Payment;
  /** المبلغ اللي اتوزّع فعلاً على الأقساط */
  applied?: number;
  remainingAfter?: number;
  /** رصيد دائن لصالح الطالب بعد الدفعة (لو دفع أكتر من المستحق) */
  creditAfter?: number;
}

/**
 * كل أقساط طالب مرتبة بتاريخ الاستحقاق،
 * مع الحالة المحسوبة (متأخر/مسدد/جزئي) بدل الحالة المخزّنة.
 */
export async function getStudentInstallments(studentId: string): Promise<Installment[]> {
  const items = await dbGetByIndex<Installment>('installments', 'by-studentId', studentId);
  const today = dayjs().format('YYYY-MM-DD');
  return items
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.periodIndex - b.periodIndex)
    .map(i => ({ ...i, status: installmentState(i, today) }));
}

/**
 * رصيد الطالب بالتفصيل: إجمالي + تفصيل لكل مجموعة مع أقساطها.
 */
export async function getStudentBalance(studentId: string): Promise<StudentBalance | null> {
  const student = await dbGetById<Student>('students', studentId);
  if (!student) return null;

  const [installments, payments, refunds, groups, courses] = await Promise.all([
    getStudentInstallments(studentId),
    dbGetByIndex<Payment>('payments', 'by-studentId', studentId),
    getStudentRefunds(studentId),
    dbGetAll<Group>('groups'),
    dbGetAll<Course>('courses'),
  ]);

  const overall = computeBalance({ installments, payments, refunds });
  const overallSummary = summarize(installments);
  const refundedTotal = refunds.reduce((s, r) => s + (r.amount || 0), 0);

  // الأقساط الملغاة (تحويل/خروج من مجموعة) ما تظهرش في المستحقات
  const visible = installments.filter(i => i.status !== 'cancelled');
  const byGroup = new Map<string, Installment[]>();
  for (const inst of visible) {
    const list = byGroup.get(inst.groupId);
    if (list) list.push(inst);
    else byGroup.set(inst.groupId, [inst]);
  }

  const groupBalances: GroupBalance[] = Array.from(byGroup.entries())
    .map(([groupId, list]) => {
      const s = summarize(list);
      const group = groups.find(g => g.id === groupId);
      const course = group ? courses.find(c => c.id === group.courseId) : undefined;
      return {
        groupId,
        groupName: group?.name || 'مجموعة محذوفة',
        courseName: course?.name || '—',
        owed: s.total,
        paid: s.paid,
        remaining: s.remaining,
        unpaidCount: s.unpaidCount,
        overdueCount: s.overdueCount,
        overdueAmount: s.overdueAmount,
        installments: list,
      };
    })
    .sort((a, b) => b.remaining - a.remaining);

  return {
    studentId,
    studentName: student.name,
    owed: overall.owed,
    paid: overall.paid,
    remaining: overall.remaining,
    unpaidCount: overallSummary.unpaidCount,
    overdueCount: overallSummary.overdueCount,
    overdueAmount: overallSummary.overdueAmount,
    credit: creditOf(overall),
    refunded: Math.round(refundedTotal * 100) / 100,
    groups: groupBalances,
  };
}

/**
 * تسجيل دفعة (كاملة أو جزئية) على أقساط طالب.
 * - groupId اختياري: لو اتحدد، الدفعة تتوزع على أقساط هذه المجموعة فقط.
 * - التوزيع: الأقدم استحقاقاً الأول.
 * - أي مبلغ زيادة عن المستحق يُسجَّل كدفعة (فائض) بدون أقساط مرتبطة.
 */
export interface RecordPaymentOptions {
  studentId: string;
  amount: number;
  groupId?: string;
  date?: string;
  notes?: string;
  courseId?: string;
  type?: PaymentType;
  // ==================== v7: محاسبة ومسؤولية ====================
  method?: PaymentMethod;
  collectedBy?: string;
  collectedByName?: string;
  /** رقم إيصال محدد (لو فاضي بيتحجز رقم تسلسلي تلقائياً) */
  receiptNo?: string;
}

export async function recordInstallmentPayment(opts: RecordPaymentOptions): Promise<PaymentResult> {
  const { studentId, amount } = opts;
  if (!studentId) return { success: false, error: 'اختر طالباً' };
  if (!(amount > 0)) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

  const student = await dbGetById<Student>('students', studentId);
  if (!student) return { success: false, error: 'الطالب غير موجود' };

  const date = opts.date || dayjs().format('YYYY-MM-DD');
  const now = new Date().toISOString();
  const group = opts.groupId ? await dbGetById<Group>('groups', opts.groupId) : undefined;

  const policy = await getBillingPolicy();
  const receiptNo = (opts.receiptNo || '').trim() || await nextReceiptNo(date, policy.receiptPrefix);

  const payment: Payment = {
    id: generateId(),
    studentId,
    courseId: opts.courseId || group?.courseId,
    groupId: opts.groupId,
    amount,
    type: opts.type || 'subscription',
    status: 'paid',
    date,
    installmentIds: [],
    method: opts.method || 'cash',
    collectedBy: opts.collectedBy,
    collectedByName: opts.collectedByName,
    receiptNo,
    notes: opts.notes || (group ? `سداد — ${group.name}` : 'سداد أقساط'),
    createdAt: now,
    updatedAt: now,
  };
  await dbAdd('payments', payment);

  // إعادة بناء المدفوع على الأقساط من كل الدفعات المسددة (طريق واحد صحيح)
  await rebuildInstallmentsFromPayments(studentId);
  const after = await getStudentBalance(studentId);

  return {
    success: true,
    payment,
    applied: amount,
    remainingAfter: Math.max(0, after?.remaining ?? 0),
    creditAfter: after?.credit ?? 0,
  };
}

/**
 * إلغاء دفعة (void) — مش حذف.
 * الدفعة بتفضل في السجل برقم إيصالها وسبب الإلغاء ومين ألغاها، لكنها ما بتتحسبش
 * في أي مجموع وما بتغطّيش أي قسط (rebuild بيستثنيها).
 */
export async function voidPayment(opts: {
  paymentId: string;
  reason: string;
  userId?: string;
  username?: string;
}): Promise<{ success: boolean; error?: string }> {
  const payment = await dbGetById<Payment>('payments', opts.paymentId);
  if (!payment) return { success: false, error: 'الدفعة غير موجودة' };
  if (payment.voided) return { success: false, error: 'الدفعة ملغاة بالفعل' };

  const reason = (opts.reason || '').trim();
  if (!reason) return { success: false, error: 'سبب الإلغاء مطلوب' };

  await dbPut('payments', {
    ...payment,
    voided: true,
    voidedAt: new Date().toISOString(),
    voidReason: reason,
    voidedBy: opts.username || opts.userId || 'غير معروف',
    installmentIds: [],
    updatedAt: new Date().toISOString(),
  });

  // إعادة توزيع الأقساط من الدفعات الصالحة فقط
  await rebuildInstallmentsFromPayments(payment.studentId);
  return { success: true };
}

/** تسجيل استرداد مبلغ لطالب (بيقلل المدفوع وبيظهر في الخزينة كمصروف نقدي) */
export async function recordRefund(opts: {
  studentId: string;
  amount: number;
  reason: string;
  paymentId?: string;
  groupId?: string;
  method?: PaymentMethod;
  date?: string;
  userId?: string;
  username?: string;
}): Promise<{ success: boolean; error?: string; refund?: Refund }> {
  if (!(opts.amount > 0)) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

  const reason = (opts.reason || '').trim();
  if (!reason) return { success: false, error: 'سبب الاسترداد مطلوب' };

  const student = await dbGetById<Student>('students', opts.studentId);
  if (!student) return { success: false, error: 'الطالب غير موجود' };

  // ما نرجّعش أكتر من اللي الطالب دفعه فعلاً
  const balance = await getStudentBalance(opts.studentId);
  const paid = balance?.paid ?? 0;
  if (opts.amount > paid) {
    return { success: false, error: `الاسترداد (${opts.amount}) أكبر من إجمالي المدفوع (${paid})` };
  }

  const now = new Date().toISOString();
  const refund: Refund = {
    id: generateId(),
    studentId: opts.studentId,
    paymentId: opts.paymentId,
    groupId: opts.groupId,
    amount: opts.amount,
    reason,
    method: opts.method || 'cash',
    date: opts.date || dayjs().format('YYYY-MM-DD'),
    userId: opts.userId,
    username: opts.username,
    createdAt: now,
    updatedAt: now,
  };
  await dbAdd('refunds', refund);
  await recalculateStudentTotalPaid(opts.studentId);

  return { success: true, refund };
}

/** كل الاستردادات (الأحدث الأول) — بتُخصم من الإيراد وتظهر في الخزينة */
export async function getRefunds(): Promise<Refund[]> {
  const rows = await dbGetAll<Refund>('refunds');
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * إعادة بناء "المدفوع" على أقساط طالب من الصفر، بناءً على كل الدفعات المسددة
 * غير المحذوفة (الأقدم تاريخاً الأول).
 *
 * دي الطريقة الآمنة الوحيدة للتحديث: أي إضافة/حذف/تغيير حالة دفعة بتستدعيها،
 * فالأقساط تفضل مطابقة للدفعات الفعلية من غير تراكم أخطاء.
 */
export async function rebuildInstallmentsFromPayments(studentId: string): Promise<void> {
  const [installments, payments] = await Promise.all([
    dbGetByIndex<Installment>('installments', 'by-studentId', studentId),
    dbGetByIndex<Payment>('payments', 'by-studentId', studentId),
  ]);
  if (installments.length === 0) {
    await recalculateStudentTotalPaid(studentId);
    return;
  }

  const originalById = new Map(installments.map(i => [i.id, i]));
  const today = dayjs().format('YYYY-MM-DD');

  // تصفير المدفوع (الملغي يفضل ملغي — applyPayment بيتخطاه)
  let current: Installment[] = installments.map(i => ({ ...i, paidAmount: 0 }));

  // الدفعات المحسوبة بس (مش محذوفة/ملغاة) — الملغاة ما بتغطّيش أي قسط
  const paidSubscription = payments
    .filter(p => isCountedPayment(p) && p.type === 'subscription')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const idsByPayment = new Map<string, string[]>();

  for (const p of paidSubscription) {
    const scope = p.groupId ? current.filter(i => i.groupId === p.groupId) : current;
    const applied = applyPayment(scope, p.amount, today);
    const updated = new Map(applied.installments.map(i => [i.id, i]));
    current = current.map(i => updated.get(i.id) || i);
    idsByPayment.set(p.id, applied.touchedIds);
  }

  // حفظ الأقساط اللي اتغيرت
  for (const inst of current) {
    const before = originalById.get(inst.id);
    const next = { ...inst, status: installmentState(inst, today) };
    const changed = !before
      || before.paidAmount !== next.paidAmount
      || before.status !== next.status;
    if (changed) {
      await dbPut('installments', { ...next, updatedAt: new Date().toISOString() });
    }
  }

  // ربط كل دفعة بالأقساط اللي غطّتها (للتتبع والإيصال)
  for (const p of paidSubscription) {
    const ids = idsByPayment.get(p.id) || [];
    if ((p.installmentIds || []).join(',') !== ids.join(',')) {
      await dbPut('payments', { ...p, installmentIds: ids, updatedAt: new Date().toISOString() });
    }
  }

  await recalculateStudentTotalPaid(studentId);
}

/**
 * دفع المتبقي: يحسب المتبقي على الطالب (أو على مجموعة محددة) ويسدده دفعة واحدة.
 */
export async function payStudentRemaining(
  studentId: string,
  groupId?: string,
  date?: string
): Promise<PaymentResult> {
  const balance = await getStudentBalance(studentId);
  if (!balance) return { success: false, error: 'الطالب غير موجود' };

  const target = groupId ? balance.groups.find(g => g.groupId === groupId) : undefined;
  if (groupId && !target) return { success: false, error: 'لا توجد مستحقات على هذه المجموعة' };

  const remaining = target
    ? target.remaining
    : balance.groups.reduce((sum, g) => sum + g.remaining, 0);

  if (remaining <= 0) return { success: false, error: 'لا يوجد مبلغ متبقٍ على الطالب' };

  return recordInstallmentPayment({
    studentId,
    groupId,
    amount: remaining,
    date,
    notes: target ? `سداد المتبقي — ${target.groupName}` : 'سداد كامل المتبقي',
  });
}

/**
 * تحديث حالات الأقساط المخزّنة: أي قسط فات تاريخ استحقاقه وفيه باقي → "متأخر".
 * تُستدعى مرة عند فتح التطبيق (وممكن دورياً).
 */
export async function markOverdueInstallments(): Promise<number> {
  const all = await dbGetAll<Installment>('installments');
  const today = dayjs().format('YYYY-MM-DD');
  let updated = 0;
  for (const inst of all) {
    const derived = installmentState(inst, today);
    if (derived !== inst.status) {
      await dbPut('installments', { ...inst, status: derived, updatedAt: new Date().toISOString() });
      updated++;
    }
  }
  return updated;
}

export interface InstallmentMigrationReport {
  enrollmentsProcessed: number;
  installmentsCreated: number;
  studentsRecalculated: number;
}

/**
 * ترحيل البيانات القديمة: توليد أقساط للتسجيلات الموجودة قبل نظام الأقساط،
 * ثم توزيع المدفوع القديم (دفعات الاشتراك) عليها — الأقدم استحقاقاً الأول.
 *
 * ملاحظة: الدفعات القديمة مش مرتبطة بمجموعة، فالتوزيع بيتم على مستوى الطالب كله.
 * التشغيل آمن ومتكرر: التسجيلات اللي ليها أقساط بالفعل بيتخطاها.
 */
export async function migrateInstallments(): Promise<InstallmentMigrationReport> {
  const report: InstallmentMigrationReport = {
    enrollmentsProcessed: 0,
    installmentsCreated: 0,
    studentsRecalculated: 0,
  };

  const [enrollments, students, groups, courses, existing] = await Promise.all([
    dbGetAll<Enrollment>('enrollments'),
    dbGetAll<Student>('students'),
    dbGetAll<Group>('groups'),
    dbGetAll<Course>('courses'),
    dbGetAll<Installment>('installments'),
  ]);

  const covered = new Set(
    existing.filter(i => !i.deleted && i.enrollmentId).map(i => i.enrollmentId as string)
  );
  const coveredPairs = new Set(
    existing.filter(i => !i.deleted).map(i => `${i.studentId}:${i.groupId}`)
  );

  // أزواج (طالب، مجموعة) المحتاجة أقساط: من التسجيلات النشطة + من enrolledGroups القديمة
  type Pair = { studentId: string; groupId: string; startDate: string; enrollmentId?: string };
  const pairs: Pair[] = [];
  const seen = new Set<string>();

  const pushPair = (p: Pair) => {
    const key = `${p.studentId}:${p.groupId}`;
    if (seen.has(key) || coveredPairs.has(key)) return;
    seen.add(key);
    pairs.push(p);
  };

  for (const e of enrollments) {
    if (e.deleted || e.status !== 'active') continue;
    if (covered.has(e.id)) continue;
    pushPair({
      studentId: e.studentId,
      groupId: e.groupId,
      startDate: e.enrolledAt || e.createdAt,
      enrollmentId: e.id,
    });
  }

  for (const s of students) {
    for (const gid of s.enrolledGroups || []) {
      pushPair({ studentId: s.id, groupId: gid, startDate: s.createdAt });
    }
  }

  const byStudent = new Map<string, Pair[]>();
  for (const p of pairs) {
    const list = byStudent.get(p.studentId);
    if (list) list.push(p);
    else byStudent.set(p.studentId, [p]);
  }

  const now = new Date().toISOString();

  for (const [studentId, list] of byStudent) {
    const created: Installment[] = [];

    for (const pair of list) {
      const group = groups.find(g => g.id === pair.groupId);
      if (!group) continue;
      const course = courses.find(c => c.id === group.courseId);
      if (!course) continue;

      // شهر بشهر: البيانات القديمة بتتحوّل لشهر واحد مفتوح
      const plan = buildMonthlyPlan({
        coursePrice: course.price,
        durationMonths: 1,
        startDate: pair.startDate,
      });

      for (const p of plan) {
        created.push({
          id: generateId(),
          studentId,
          groupId: pair.groupId,
          enrollmentId: pair.enrollmentId,
          periodIndex: p.periodIndex,
          periodLabel: p.periodLabel,
          amount: p.amount,
          paidAmount: 0,
          dueDate: p.dueDate,
          status: 'pending' as InstallmentStatus,
          createdAt: now,
          updatedAt: now,
        });
      }
      report.enrollmentsProcessed++;
    }

    if (created.length === 0) continue;

    await dbBulkAdd('installments', created);
    report.installmentsCreated += created.length;

    // توزيع المدفوع القديم (دفعات الاشتراك المسددة) على الأقساط — الأقدم استحقاقاً الأول
    await rebuildInstallmentsFromPayments(studentId);
    report.studentsRecalculated++;
  }

  return report;
}

// ==================== SPECIALIZED QUERIES ====================

export async function recalculateStudentTotalPaid(studentId: string): Promise<void> {
  const student = await dbGetById<Student>('students', studentId);
  if (!student) return;

  const [payments, installments, refunds] = await Promise.all([
    dbGetByIndex<Payment>('payments', 'by-studentId', studentId),
    dbGetByIndex<Installment>('installments', 'by-studentId', studentId),
    getStudentRefunds(studentId),
  ]);

  // الأقساط هي مصدر الحقيقة للمستحقات. لو مفيش أقساط (بيانات قديمة قبل الترحيل)
  // نرجع للحساب التقريبي القديم عشان الأرقام ما تتغيرش فجأة على المستخدم.
  const balance = installments.length > 0
    ? computeBalance({ installments, payments, refunds })
    : await computeLegacyBalance(student, payments, refunds);

  await dbPut('students', {
    ...student,
    totalPaid: balance.paid,
    totalOwed: balance.owed,
    updatedAt: new Date().toISOString(),
  });
}

/** استردادات طالب (بتقلل المدفوع) */
export async function getStudentRefunds(studentId: string): Promise<Refund[]> {
  try {
    const rows = await dbGetByIndex<Refund>('refunds', 'by-studentId', studentId);
    return rows.filter(r => !r.deleted);
  } catch {
    return [];
  }
}

/**
 * حساب المستحقات بالطريقة القديمة (سعر الكورس × مدة الكورس لكل المجموعات النشطة)
 * تُستخدم فقط للطلاب اللي لسه ما اتولّدتلهمش أقساط.
 */
async function computeLegacyBalance(
  student: Student,
  payments: Payment[],
  refunds: Refund[] = []
): Promise<BalanceSummary> {
  let totalOwed = 0;
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', student.id);
  const activeGroupIds = enrollments
    .filter(e => e.status === 'active' && !e.deleted)
    .map(e => e.groupId);

  // If no enrollments exist yet (legacy data), use enrolledGroups
  const groupIds = activeGroupIds.length > 0 ? activeGroupIds : (student.enrolledGroups || []);

  if (groupIds.length > 0) {
    const groups = await dbGetAll<Group>('groups');
    const courses = await dbGetAll<Course>('courses');

    for (const groupId of groupIds) {
      const group = groups.find(g => g.id === groupId);
      if (group && !group.deleted) {
        const course = courses.find(c => c.id === group.courseId);
        if (course) {
          // شهر بشهر: المطلوب = سعر شهر واحد
          totalOwed += course.price;
        }
      }
    }
  }

  const extraOwed = payments
    .filter(p => p.type !== 'subscription' && !p.deleted && !p.voided)
    .reduce((sum, p) => sum + p.amount, 0);
  totalOwed += extraOwed;

  const grossPaid = payments.filter(isCountedPayment).reduce((sum, p) => sum + p.amount, 0);
  // الاستردادات تقلّل المدفوع الفعلي (نفس منطق computeBalance)
  const refunded = refunds.filter(r => !r.deleted).reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalPaid = Math.max(0, grossPaid - refunded);

  return {
    owed: Math.round(totalOwed * 100) / 100,
    paid: Math.round(totalPaid * 100) / 100,
    remaining: Math.round((totalOwed - totalPaid) * 100) / 100,
  };
}

/**
 * تحديث حالة المجموعة تلقائياً بناءً على عدد الطلاب:
 * - open → full عند اكتمال العدد
 * - full → open عند توفر مكان
 * (المجموعات المنتهية 'ended' لا تتغير تلقائياً)
 */
export async function syncGroupStatus(groupId: string): Promise<void> {
  const group = await dbGetById<Group>('groups', groupId);
  if (!group || group.status === 'ended') return;
  const shouldBeFull = group.studentIds.length >= group.maxStudents;
  const newStatus: GroupStatus = shouldBeFull ? 'full' : 'open';
  if (group.status !== newStatus) {
    await dbPut('groups', { ...group, status: newStatus, updatedAt: new Date().toISOString() });
  }
}

/**
 * فحص وإصلاح سلامة الروابط بين الكيانات:
 * - تسجيلات طلاب في مجموعات محذوفة/غير موجودة
 * - طلاب محذوفون ما زالوا في قوائم المجموعات
 * - مجموعات مرتبطة بكورسات أو مدرسين محذوفين (تقرير فقط)
 * ثم إعادة حساب الأرصدة وحالات المجموعات المتأثرة.
 */
export interface IntegrityReport {
  staleEnrollments: number;
  staleGroupMembers: number;
  orphanGroupCourses: string[];
  orphanGroupTeachers: string[];
  recalculatedStudents: number;
}

export async function runIntegrityFix(): Promise<IntegrityReport> {
  const [students, groups, courses, teachers] = await Promise.all([
    dbGetAll<Student>('students'),
    dbGetAll<Group>('groups'),
    dbGetAll<Course>('courses'),
    dbGetAll<Teacher>('teachers'),
  ]);

  const activeGroupIds = new Set(groups.map(g => g.id));
  const activeStudentIds = new Set(students.map(s => s.id));
  const activeCourseIds = new Set(courses.map(c => c.id));
  const activeTeacherIds = new Set(teachers.map(t => t.id));

  const report: IntegrityReport = {
    staleEnrollments: 0,
    staleGroupMembers: 0,
    orphanGroupCourses: [],
    orphanGroupTeachers: [],
    recalculatedStudents: 0,
  };

  const affectedStudentIds = new Set<string>();

  // 1) تنظيف enrolledGroups عند الطلاب
  for (const s of students) {
    const cleaned = (s.enrolledGroups || []).filter(gid => activeGroupIds.has(gid));
    if (cleaned.length !== (s.enrolledGroups || []).length) {
      report.staleEnrollments += (s.enrolledGroups || []).length - cleaned.length;
      await dbPut('students', { ...s, enrolledGroups: cleaned, updatedAt: new Date().toISOString() });
      affectedStudentIds.add(s.id);
    }
  }

  // 2) تنظيف studentIds في المجموعات + رصد الكورسات/المدرسين المفقودين
  for (const g of groups) {
    const cleaned = g.studentIds.filter(sid => activeStudentIds.has(sid));
    if (cleaned.length !== g.studentIds.length) {
      report.staleGroupMembers += g.studentIds.length - cleaned.length;
      await dbPut('groups', { ...g, studentIds: cleaned, updatedAt: new Date().toISOString() });
      await syncGroupStatus(g.id);
    }
    if (!activeCourseIds.has(g.courseId)) report.orphanGroupCourses.push(g.name);
    if (!activeTeacherIds.has(g.teacherId)) report.orphanGroupTeachers.push(g.name);
  }

  // 3) Cross-check enrollments table: remove orphan enrollments referencing deleted students/groups
  const enrollments = await dbGetAll<Enrollment>('enrollments');
  for (const enrollment of enrollments) {
    if (!activeStudentIds.has(enrollment.studentId) || !activeGroupIds.has(enrollment.groupId)) {
      await dbSoftDelete('enrollments', enrollment.id);
      report.staleEnrollments++;
      continue;
    }
    // Ensure denormalized arrays are in sync with enrollment records
    if (enrollment.status === 'active') {
      const group = groups.find(g => g.id === enrollment.groupId);
      const student = students.find(s => s.id === enrollment.studentId);
      if (group && !group.studentIds.includes(enrollment.studentId)) {
        group.studentIds.push(enrollment.studentId);
        await dbPut('groups', { ...group, updatedAt: new Date().toISOString() });
        report.staleGroupMembers++;
      }
      if (student && !student.enrolledGroups.includes(enrollment.groupId)) {
        student.enrolledGroups.push(enrollment.groupId);
        await dbPut('students', { ...student, updatedAt: new Date().toISOString() });
      }
    }
  }

  // 4) Sync enrollments from denormalized arrays (legacy data without enrollment records)
  for (const group of groups) {
    for (const studentId of group.studentIds) {
      const existingEnrollment = enrollments.find(
        e => e.studentId === studentId && e.groupId === group.id && !e.deleted && e.status === 'active'
      );
      if (!existingEnrollment) {
        const student = students.find(s => s.id === studentId);
        if (student && !student.deleted) {
          await dbAdd('enrollments', {
            id: generateId(),
            studentId,
            groupId: group.id,
            enrolledAt: group.createdAt || new Date().toISOString(),
            status: 'active' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          report.staleEnrollments++;
        }
      }
    }
  }

  // 5) إعادة حساب أرصدة الطلاب المتأثرين
  for (const sid of affectedStudentIds) {
    await recalculateStudentTotalPaid(sid);
    report.recalculatedStudents++;
  }

  return report;
}

export async function getGroupAttendanceForDate(
  groupId: string,
  date: string
): Promise<Attendance[]> {
  try {
    const db = await getDB();
    const all = await db.getAllFromIndex('attendance', 'by-groupDate', [groupId, date]);
    return all as Attendance[];
  } catch {
    const all = await dbGetByIndex<Attendance>('attendance', 'by-groupId', groupId);
    return all.filter(a => a.date === date);
  }
}

// ==================== BACKUP / RESTORE ====================

/** كل المتاجر اللي بتدخل في النسخة الاحتياطية (بالترتيب) */
export const BACKUP_STORES: StoreName[] = [
  'students', 'teachers', 'courses', 'groups',
  'payments', 'attendance', 'expenses', 'exams', 'grades',
  'enrollments', 'installments', 'inventory', 'inventory_transactions',
  // v7
  'refunds', 'cashbox_sessions', 'payroll', 'teacher_advances',
  'message_logs', 'message_templates', 'waitlist', 'audit_logs', 'counters',
];

/** مفتاح التصدير لاسم متجر (التصدير تاريخياً استخدم camelCase لبعض الجداول) */
function exportKey(store: StoreName): string {
  return store === 'inventory_transactions' ? 'inventoryTransactions' : store;
}

export interface ExportOptions {
  /**
   * تضمين جدول `users` (فيه password hashes).
   * افتراضي `true` للنسخ المحلية (عشان استرجاع تسجيل الدخول)،
   * ولازم يكون `false` لأي نسخة بتترفع للسحابة.
   */
  includeUsers?: boolean;
}

export async function exportAllData(opts: ExportOptions = {}): Promise<object> {
  const db = await getDB();
  const includeUsers = opts.includeUsers !== false;

  const stores = includeUsers ? [...BACKUP_STORES, 'users' as StoreName] : BACKUP_STORES;

  const payload: Record<string, unknown> = {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    includeUsers,
  };

  for (const store of stores) {
    if (!db.objectStoreNames.contains(store)) continue;
    payload[exportKey(store)] = await db.getAll(store);
  }

  payload['settings'] = await db.get('settings', 'main');

  return payload;
}

export async function importAllData(data: Record<string, unknown>): Promise<void> {
  const db = await getDB();
  // `users` بيتستورد فقط لو النسخة فيها فعلاً (نسخ السحابة مش بتحتويه)
  const stores: StoreName[] = [...BACKUP_STORES];
  if (Array.isArray(data['users'])) stores.push('users');

  for (const store of stores) {
    if (!db.objectStoreNames.contains(store)) continue;
    const key = exportKey(store);
    const items = data[key] ?? data[store];
    // Only touch a store if the backup actually contains it (older backups
    // may lack newer stores such as `users` — never wipe those by accident).
    if (!Array.isArray(items)) continue;
    await dbClearStore(store);
    if (items.length > 0) {
      await dbBulkAdd(store, items);
    }
  }

  if (data['settings'] && typeof data['settings'] === 'object' && !Array.isArray(data['settings'])) {
    await db.put('settings', data['settings'] as Settings);
  }
}

// ==================== USER AUTH ====================

export async function getUserByUsername(username: string): Promise<User | undefined> {
  try {
    const db = await getDB();
    const users: User[] = await db.getAllFromIndex('users', 'by-username', username);
    return users.find(u => !u.deleted);
  } catch (e) {
    console.error('getUserByUsername error:', e);
    return undefined;
  }
}
