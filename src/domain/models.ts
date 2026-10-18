/**
 * Backward-compatible type barrel. Prefer focused model modules for new code.
 */
export type { Subject, SubjectId, SubjectPrices } from './subject';
export type {
  StudentStatus,
  Gender,
  TeacherStatus,
  TeacherPayModel,
  GroupStatus,
  PaymentStatus,
  PaymentType,
  PaymentMethod,
  AttendanceStatus,
  UserRole,
  ExpenseCategory,
} from './models/common';
export type {
  Student,
  Teacher,
  PayrollRecord,
  PayrollLine,
  PayrollStudentLine,
  TeacherAdvance,
  User,
} from './models/people';
export type { Course, CourseLevel, Group, ScheduleItem } from './models/catalog';
export type { Payment, Refund, CashSession, Counter, Expense } from './models/finance';
export type { Attendance, Exam, Grade } from './models/academic';
export type { Settings } from './models/settings';
export type { MessageLog, MessageTemplate, WaitlistEntry } from './models/communications';
export type { InventoryItem, InventoryTransaction } from './models/inventory';
export type { EnrollmentStatus, Enrollment, EnrollmentRenewal } from './models/enrollment';
