import type { Installment } from '../../lib/billing';
import type {
  Attendance,
  Enrollment,
  Group,
  Payment,
  PayrollLine,
  Student,
  Teacher,
  TeacherAdvance,
  TeacherPayModel,
} from '../models';

export type TeacherPaySettings = Pick<Teacher, 'payModel' | 'payRate' | 'salary' | 'payNotes'>;

export interface PayrollContext {
  teachers: Teacher[];
  groups: Group[];
  enrollments: Enrollment[];
  attendance: Attendance[];
  payments: Payment[];
  advances: TeacherAdvance[];
  /** اختياريان للتوافق مع سياقات الحساب القديمة؛ التحميل الفعلي يشملهما دائماً */
  installments?: Installment[];
  students?: Student[];
}

export interface TeacherPayrollCalc {
  teacherId: string;
  teacherName: string;
  model: TeacherPayModel;
  rate: number;
  base: number;
  baseLabel: string;
  gross: number;
  deductions: number;
  advances: number;
  net: number;
  lines: PayrollLine[];
}

// ==================== PROFITABILITY ====================

export interface GroupProfit {
  groupId: string;
  groupName: string;
  teacherName: string;
  courseName: string;
  students: number;
  /** المحصّل فعلياً في الفترة */
  collected: number;
  /** المستحق في الفترة (من الأقساط) */
  owed: number;
  /** تكلفة المدرس */
  teacherCost: number;
  /** تكلفة الملازم/الكتب المباعة للمجموعة */
  materialCost: number;
  profit: number;
  marginPct: number;
}
