import { openDB, IDBPDatabase } from 'idb';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import {
  Installment,
  InstallmentStatus,
  BalanceSummary,
  buildMonthlyPlan,
  applyPayment,
  computeBalance,
  installmentRemaining,
  installmentState,
  proratedFirstPeriod,
  summarize,
} from './billing';

// ==================== INTERFACES ====================

export type StudentStatus = 'active' | 'suspended' | 'ended';
export type Gender = 'male' | 'female';
export type TeacherStatus = 'active' | 'vacation' | 'suspended';
export type GroupStatus = 'open' | 'full' | 'ended';
export type PaymentStatus = 'paid' | 'pending' | 'late';
export type PaymentType = 'subscription' | 'books' | 'other';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type UserRole = 'admin' | 'teacher';
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
  salary: number;
  status: TeacherStatus;
  avatar?: string;
  notes?: string;
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
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

// الأقساط/المستحقات — التعريف في src/lib/billing.ts (منطق نقي قابل للاختبار)
export type { Installment, InstallmentStatus, BalanceSummary };
export { installmentRemaining, installmentState, summarize, SESSIONS_PER_MONTH } from './billing';

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
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  date: string;
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
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

// ==================== DB INIT ====================

const DB_NAME = 'EduCenterProDB';
const DB_VERSION = 6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: IDBPDatabase<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDB(): Promise<IDBPDatabase<any>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
  | 'enrollments' | 'installments';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbGetAll<T = any>(storeName: StoreName): Promise<T[]> {
  try {
    const db = await getDB();
    const all: T[] = await db.getAll(storeName);
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

export async function dbSoftDelete(storeName: StoreName, id: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = await dbGetById<any>(storeName, id);
    if (item) {
      await dbPut(storeName, { ...item, deleted: true, updatedAt: new Date().toISOString() });
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
export async function enrollStudent(
  studentId: string,
  groupId: string,
  initialPayment?: number,
  opts?: { startSession?: number }
): Promise<{ success: boolean; error?: string }> {
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
    const enrollment: Enrollment = {
      id: enrollmentId,
      studentId,
      groupId,
      status: 'active',
      enrolledAt: now,
      startSession,
      initialPayment: initialPayment || 0,
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('enrollments', enrollment);

    // 4b. توليد خطة الأقساط الشهرية لهذا التسجيل (المستحقات الحقيقية على الطالب)
    const course = await dbGetById<Course>('courses', group.courseId);
    const plan = buildMonthlyPlan({
      coursePrice: course?.price || 0,
      durationMonths: course?.durationMonths || 1,
      startDate: now,
      // الالتحاق في نص الكورس: الشهر الأول يتحسب على الحصص الباقية بس
      firstPeriodAmount: startSession && course
        ? proratedFirstPeriod(course.price, startSession)
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
      await dbAdd('payments', {
        id: generateId(),
        studentId,
        courseId: group.courseId,
        groupId,
        amount: initialPayment,
        date: now.split('T')[0],
        type: 'subscription',
        status: 'paid',
        installmentIds: [],
        notes: `تسجيل في ${group.name}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 7. Sync group status
    await syncGroupStatus(groupId);

    // 8. توزيع الدفعات على الأقساط + إعادة حساب أرصدة الطالب
    await rebuildInstallmentsFromPayments(studentId);

    return { success: true };
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
  const plan = buildMonthlyPlan({
    coursePrice: course?.price || 0,
    durationMonths: course?.durationMonths || 1,
    startDate: now,
    firstPeriodAmount: startSession && course ? proratedFirstPeriod(course.price, startSession) : undefined,
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

  // 6) إعادة توزيع المدفوع على الأقساط الجديدة + تحديث أرصدة الطالب
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

  const [installments, payments, groups, courses] = await Promise.all([
    getStudentInstallments(studentId),
    dbGetByIndex<Payment>('payments', 'by-studentId', studentId),
    dbGetAll<Group>('groups'),
    dbGetAll<Course>('courses'),
  ]);

  const overall = computeBalance({ installments, payments });
  const overallSummary = summarize(installments);

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
    groups: groupBalances,
  };
}

/**
 * تسجيل دفعة (كاملة أو جزئية) على أقساط طالب.
 * - groupId اختياري: لو اتحدد، الدفعة تتوزع على أقساط هذه المجموعة فقط.
 * - التوزيع: الأقدم استحقاقاً الأول.
 * - أي مبلغ زيادة عن المستحق يُسجَّل كدفعة (فائض) بدون أقساط مرتبطة.
 */
export async function recordInstallmentPayment(opts: {
  studentId: string;
  amount: number;
  groupId?: string;
  date?: string;
  notes?: string;
  courseId?: string;
  type?: PaymentType;
}): Promise<PaymentResult> {
  const { studentId, amount } = opts;
  if (!studentId) return { success: false, error: 'اختر طالباً' };
  if (!(amount > 0)) return { success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };

  const student = await dbGetById<Student>('students', studentId);
  if (!student) return { success: false, error: 'الطالب غير موجود' };

  const date = opts.date || dayjs().format('YYYY-MM-DD');
  const now = new Date().toISOString();
  const group = opts.groupId ? await dbGetById<Group>('groups', opts.groupId) : undefined;

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
    notes: opts.notes || (group ? `سداد — ${group.name}` : 'سداد أقساط'),
    createdAt: now,
    updatedAt: now,
  };
  await dbAdd('payments', payment);

  // إعادة بناء المدفوع على الأقساط من كل الدفعات المسددة (طريق واحد صحيح)
  await rebuildInstallmentsFromPayments(studentId);
  const after = await getStudentBalance(studentId);

  return { success: true, payment, applied: amount, remainingAfter: after?.remaining ?? 0 };
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

  const paidSubscription = payments
    .filter(p => !p.deleted && p.status === 'paid' && p.type === 'subscription')
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

      const plan = buildMonthlyPlan({
        coursePrice: course.price,
        durationMonths: course.durationMonths,
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

  const [payments, installments] = await Promise.all([
    dbGetByIndex<Payment>('payments', 'by-studentId', studentId),
    dbGetByIndex<Installment>('installments', 'by-studentId', studentId),
  ]);

  // الأقساط هي مصدر الحقيقة للمستحقات. لو مفيش أقساط (بيانات قديمة قبل الترحيل)
  // نرجع للحساب التقريبي القديم عشان الأرقام ما تتغيرش فجأة على المستخدم.
  const balance = installments.length > 0
    ? computeBalance({ installments, payments })
    : await computeLegacyBalance(student, payments);

  await dbPut('students', {
    ...student,
    totalPaid: balance.paid,
    totalOwed: balance.owed,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * حساب المستحقات بالطريقة القديمة (سعر الكورس × مدة الكورس لكل المجموعات النشطة)
 * تُستخدم فقط للطلاب اللي لسه ما اتولّدتلهمش أقساط.
 */
async function computeLegacyBalance(
  student: Student,
  payments: Payment[]
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
          // Course price is a monthly rate; total owed covers the full duration
          totalOwed += course.price * Math.max(1, course.durationMonths);
        }
      }
    }
  }

  const extraOwed = payments
    .filter(p => p.type !== 'subscription' && !p.deleted)
    .reduce((sum, p) => sum + p.amount, 0);
  totalOwed += extraOwed;

  const totalPaid = payments
    .filter(p => p.status === 'paid' && !p.deleted)
    .reduce((sum, p) => sum + p.amount, 0);

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

export async function exportAllData(): Promise<object> {
  const db = await getDB();
  const [students, teachers, courses, groups, payments, attendance, expenses, exams, grades, enrollments, installments, inventory, inventoryTransactions, users] =
    await Promise.all([
      db.getAll('students'),
      db.getAll('teachers'),
      db.getAll('courses'),
      db.getAll('groups'),
      db.getAll('payments'),
      db.getAll('attendance'),
      db.getAll('expenses'),
      db.getAll('exams'),
      db.getAll('grades'),
      db.getAll('enrollments'),
      db.getAll('installments'),
      db.getAll('inventory'),
      db.getAll('inventory_transactions'),
      db.getAll('users'),
    ]);
  const settings = await db.get('settings', 'main');

  return {
    version: 6,
    exportedAt: new Date().toISOString(),
    students,
    teachers,
    courses,
    groups,
    payments,
    attendance,
    settings,
    expenses,
    exams,
    grades,
    enrollments,
    installments,
    inventory,
    inventoryTransactions,
    users,
  };
}

export async function importAllData(data: Record<string, unknown>): Promise<void> {
  const stores: StoreName[] = [
    'students', 'teachers', 'courses', 'groups',
    'payments', 'attendance', 'expenses', 'exams', 'grades',
    'enrollments', 'installments', 'inventory', 'inventory_transactions', 'users'
  ];

  for (const store of stores) {
    // Handle both 'enrollments' and 'inventoryTransactions' naming
    const storeKey = store === 'inventory_transactions' ? 'inventoryTransactions' : store;
    const items = data[storeKey] ?? data[store];
    // Only touch a store if the backup actually contains it (older backups
    // may lack newer stores such as `users` — never wipe those by accident).
    if (!Array.isArray(items)) continue;
    await dbClearStore(store);
    if (items.length > 0) {
      await dbBulkAdd(store, items);
    }
  }

  if (data['settings'] && typeof data['settings'] === 'object' && !Array.isArray(data['settings'])) {
    const db = await getDB();
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
