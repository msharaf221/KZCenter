import type { Gender, StudentStatus, TeacherPayModel, TeacherStatus, UserRole } from './common';
import type { SubjectId } from '../subject';

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
  /** كود أو رقم باركود الطالب */
  code?: string;
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
