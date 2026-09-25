/**
 * Compatibility entry point. Implementations live in domain/, data/ and services/.
 * Keep existing consumers/backups working; new code imports the owning module.
 */

export type {
  Attendance,
  AttendanceStatus,
  CashSession,
  Counter,
  Course,
  CourseLevel,
  Enrollment,
  EnrollmentRenewal,
  EnrollmentStatus,
  Exam,
  Expense,
  ExpenseCategory,
  Gender,
  Grade,
  Group,
  GroupStatus,
  InventoryItem,
  InventoryTransaction,
  MessageLog,
  MessageTemplate,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PayrollLine,
  PayrollRecord,
  PayrollStudentLine,
  Refund,
  ScheduleItem,
  Settings,
  Student,
  StudentStatus,
  Teacher,
  TeacherAdvance,
  TeacherPayModel,
  TeacherStatus,
  User,
  UserRole,
  WaitlistEntry
} from '../domain/models';

export { getDB } from '../data/database';

export { getUserByUsername, seedDefaultData } from '../services/bootstrap';

export { generateId } from './ids';

export type { StoreName } from '../data/stores';

export { BACKUP_STORES } from '../data/stores';

export type { DbGetAllOptions, SoftDeleteMeta } from '../data/records';

export {
  dbAdd,
  dbBulkAdd,
  dbClearStore,
  dbGetAll,
  dbGetById,
  dbGetByIndex,
  dbGetPaginated,
  dbPut,
  dbSoftDelete
} from '../data/records';

export type { EnrollOptions } from '../services/enrollmentService';

export { enrollStudent, getGroupStudents, unenrollStudent } from '../services/enrollmentService';

export type { RenewOptions, RenewResult, RenewalCandidate } from '../services/renewalService';

export { getRenewalCandidates, renewEnrollment } from '../services/renewalService';

export type { TransferRecord, TransferResult } from '../services/transferService';

export { getTransferHistory, transferStudent } from '../services/transferService';

export type { DebtorRow, GroupBalance, StudentBalance } from '../services/balanceService';

export {
  getDebtors,
  getStudentBalance,
  getStudentInstallments,
  getStudentRefunds,
  recalculateStudentTotalPaid
} from '../services/balanceService';

export type { PaymentResult, RecordPaymentOptions } from '../services/paymentService';

export {
  getRefunds,
  payStudentRemaining,
  rebuildInstallmentsFromPayments,
  recordInstallmentPayment,
  recordRefund,
  voidPayment
} from '../services/paymentService';

export type { WriteOffOptions, WriteOffPreview, WriteOffResult, WriteOffScope } from '../services/debtWriteOffService';

export {
  WRITE_OFF_CONFIRM_WORD,
  WRITE_OFF_SCOPE_HINT,
  WRITE_OFF_SCOPE_LABEL,
  previewWriteOff,
  writeOffDebts
} from '../services/debtWriteOffService';

export type { InstallmentMigrationReport, IntegrityReport } from '../services/maintenanceService';

export { markOverdueInstallments, migrateInstallments, runIntegrityFix } from '../services/maintenanceService';

export { getGroupAttendanceForDate, syncGroupStatus } from '../services/groupService';

export type { ExportOptions } from '../services/backupService';

export { exportAllData, importAllData } from '../services/backupService';

export type {
  AgingBucket,
  BalanceSummary,
  Installment,
  InstallmentStatus,
  PricingInput,
  RenewalInfo,
  RenewalState,
  UpcomingDues
} from './billing';

export {
  AGING_RANGES,
  RENEWAL_STATE_LABEL,
  SESSIONS_PER_MONTH,
  computeDueDate,
  creditOf,
  daysOverdue,
  debtAging,
  discountBreakdown,
  effectiveMonthlyPrice,
  installmentRemaining,
  installmentState,
  isCountedPayment,
  renewalInfo,
  resolveSessionsPerMonth,
  sessionPrice,
  summarize,
  upcomingDues
} from './billing';
