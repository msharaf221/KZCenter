import type { AuditEntry } from '../domain/audit';
import type {
  Attendance,
  CashSession,
  Counter,
  Course,
  Enrollment,
  Exam,
  Expense,
  Grade,
  Group,
  InventoryItem,
  InventoryTransaction,
  MessageLog,
  MessageTemplate,
  Payment,
  PayrollRecord,
  Refund,
  Settings,
  Student,
  Teacher,
  TeacherAdvance,
  User,
  WaitlistEntry,
} from '../domain/models';
import type { Installment } from '../lib/billing';

/** IndexedDB row contracts shared by reads and direct transactions. */
export interface StoreRecords {
  students: Student;
  teachers: Teacher;
  courses: Course;
  groups: Group;
  payments: Payment;
  attendance: Attendance;
  users: User;
  settings: Settings;
  expenses: Expense;
  exams: Exam;
  grades: Grade;
  inventory: InventoryItem;
  inventory_transactions: InventoryTransaction;
  enrollments: Enrollment;
  installments: Installment;
  audit_logs: AuditEntry;
  counters: Counter;
  refunds: Refund;
  cashbox_sessions: CashSession;
  payroll: PayrollRecord;
  teacher_advances: TeacherAdvance;
  message_logs: MessageLog;
  message_templates: MessageTemplate;
  waitlist: WaitlistEntry;
}

export type StoreName = keyof StoreRecords;

export type DatabaseSchema = {
  [Name in StoreName]: {
    key: string;
    value: StoreRecords[Name];
    // Store/index names remain compatible with v7 and old backup files.
    indexes: Record<string, IDBValidKey>;
  };
};
