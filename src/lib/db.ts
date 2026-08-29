import { openDB, IDBPDatabase } from 'idb';
import bcrypt from 'bcryptjs';

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
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
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
  language: 'ar' | 'en';
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
  initialPayment?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

// ==================== DB INIT ====================

const DB_NAME = 'EduCenterProDB';
const DB_VERSION = 5;

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
      language: 'ar',
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
  | 'enrollments';

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
    return await db.get(storeName, id) as T | undefined;
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

export async function dbRemove(storeName: StoreName, id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(storeName, id);
  } catch (e) {
    console.error(`dbRemove(${storeName}) error:`, e);
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
 */
export async function enrollStudent(
  studentId: string,
  groupId: string,
  initialPayment?: number
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
    const enrollment: Enrollment = {
      id: enrollmentId,
      studentId,
      groupId,
      status: 'active',
      enrolledAt: now,
      initialPayment: initialPayment || 0,
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('enrollments', enrollment);

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

    // 6. Create payment if provided
    if (initialPayment && initialPayment > 0) {
      await dbAdd('payments', {
        id: generateId(),
        studentId,
        courseId: group.courseId,
        amount: initialPayment,
        date: now.split('T')[0],
        type: 'subscription',
        status: 'paid',
        notes: `تسجيل في ${group.name}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 7. Sync group status
    await syncGroupStatus(groupId);

    // 8. Recalculate student totals
    await recalculateStudentTotalPaid(studentId);

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

/**
 * نقل طالب من مجموعة لأخرى
 */
export async function transferStudent(
  studentId: string,
  fromGroupId: string,
  toGroupId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate target group
    const toGroup = await dbGetById<Group>('groups', toGroupId);
    if (!toGroup) return { success: false, error: 'المجموعة الوجهة غير موجودة' };
    if (toGroup.status === 'ended') return { success: false, error: 'المجموعة الوجهة منتهية' };
    if (toGroup.studentIds.length >= toGroup.maxStudents) {
      return { success: false, error: 'المجموعة الوجهة مكتملة' };
    }

    // Check if already in target group
    const existingEnrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, toGroupId]);
    if (existingEnrollments.some(e => e.status === 'active')) {
      return { success: false, error: 'الطالب مسجل بالفعل في المجموعة الوجهة' };
    }

    // Save the original enrollment for rollback
    const sourceEnrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, fromGroupId]);
    const originalEnrollment = sourceEnrollments.find(e => e.status === 'active' && !e.deleted);

    // Unenroll from source
    const unenrollResult = await unenrollStudent(studentId, fromGroupId, 'نقل لمجموعة أخرى');
    if (!unenrollResult.success) return unenrollResult;

    // Enroll in target
    const enrollResult = await enrollStudent(studentId, toGroupId);
    if (!enrollResult.success) {
      // Rollback: restore original enrollment record instead of creating a new one
      if (originalEnrollment) {
        const now = new Date().toISOString();
        await dbPut('enrollments', { ...originalEnrollment, status: 'active' as const, updatedAt: now });
      }
      // Also restore denormalized arrays
      const [student, group] = await Promise.all([
        dbGetById<Student>('students', studentId),
        dbGetById<Group>('groups', fromGroupId),
      ]);
      if (student && !student.enrolledGroups.includes(fromGroupId)) {
        await dbPut('students', { ...student, enrolledGroups: [...student.enrolledGroups, fromGroupId], updatedAt: new Date().toISOString() });
      }
      if (group && !group.studentIds.includes(studentId)) {
        await dbPut('groups', { ...group, studentIds: [...group.studentIds, studentId], updatedAt: new Date().toISOString() });
        await syncGroupStatus(fromGroupId);
      }
      return enrollResult;
    }

    // Update enrollment type to 'transferred'
    const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, toGroupId]);
    const newEnrollment = enrollments.find(e => e.status === 'active');
    if (newEnrollment) {
      await dbPut('enrollments', { ...newEnrollment, status: 'transferred' as EnrollmentStatus, updatedAt: new Date().toISOString() });
    }

    return { success: true };
  } catch (error) {
    console.error('transferStudent error:', error);
    return { success: false, error: String(error) };
  }
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

/**
 * جلب كل المجموعات المسجل بها طالب
 */
export async function getStudentGroups(studentId: string): Promise<Group[]> {
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', studentId);
  const activeGroupIds = enrollments
    .filter(e => e.status === 'active' && !e.deleted)
    .map(e => e.groupId);

  const groups: Group[] = [];
  for (const gid of activeGroupIds) {
    const group = await dbGetById<Group>('groups', gid);
    if (group && !group.deleted) {
      groups.push(group);
    }
  }
  return groups;
}

/**
 * جلب enrollment record لطالب في مجموعة
 */
export async function getEnrollment(studentId: string, groupId: string): Promise<Enrollment | undefined> {
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, groupId]);
  return enrollments.find(e => !e.deleted);
}

/**
 * جلب إحصائيات التسجيل لمجموعة
 */
export async function getGroupEnrollmentStats(groupId: string): Promise<{
  total: number;
  active: number;
  dropped: number;
  transferred: number;
}> {
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-groupId', groupId);
  return {
    total: enrollments.length,
    active: enrollments.filter(e => e.status === 'active').length,
    dropped: enrollments.filter(e => e.status === 'dropped').length,
    transferred: enrollments.filter(e => e.status === 'transferred').length,
  };
}

// ==================== SPECIALIZED QUERIES ====================

export async function getStudentAttendanceSummary(studentId: string): Promise<{
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
}> {
  const records = await dbGetByIndex<Attendance>('attendance', 'by-studentId', studentId);
  const total = records.length;
  const present = records.filter(r => r.status === 'present').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const late = records.filter(r => r.status === 'late').length;
  const excused = records.filter(r => r.status === 'excused').length;
  const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
  return { total, present, absent, late, excused, percentage };
}

export async function recalculateStudentTotalPaid(studentId: string): Promise<void> {
  const student = await dbGetById<Student>('students', studentId);
  if (!student) return;
  
  const payments = await dbGetByIndex<Payment>('payments', 'by-studentId', studentId);
  const totalPaid = payments
    .filter(p => p.status === 'paid' && !p.deleted)
    .reduce((sum, p) => sum + p.amount, 0);
    
  // Use enrollments table as source of truth, fall back to enrolledGroups
  let totalOwed = 0;
  const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', studentId);
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
          totalOwed += course.price;
        }
      }
    }
  }
  
  const nonSubscriptionPayments = payments.filter(p => p.type !== 'subscription' && !p.deleted);
  const extraOwed = nonSubscriptionPayments.reduce((sum, p) => sum + p.amount, 0);
  
  totalOwed += extraOwed;

  await dbPut('students', { ...student, totalPaid, totalOwed, updatedAt: new Date().toISOString() });
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
  const [students, teachers, courses, groups, payments, attendance, expenses, exams, grades, enrollments, inventory, inventoryTransactions] =
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
      db.getAll('inventory'),
      db.getAll('inventory_transactions'),
    ]);
  const settings = await db.get('settings', 'main');

  return {
    version: 5,
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
    inventory,
    inventoryTransactions,
  };
}

export async function importAllData(data: Record<string, unknown>): Promise<void> {
  const stores: StoreName[] = [
    'students', 'teachers', 'courses', 'groups',
    'payments', 'attendance', 'expenses', 'exams', 'grades',
    'enrollments', 'inventory', 'inventory_transactions'
  ];

  for (const store of stores) {
    await dbClearStore(store);
    // Handle both 'enrollments' and 'inventoryTransactions' naming
    const storeKey = store === 'inventory_transactions' ? 'inventoryTransactions' : store;
    const items = data[storeKey] || data[store];
    if (items && Array.isArray(items) && items.length > 0) {
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

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const user = await dbGetById<User>('users', userId);
  if (!user) throw new Error('User not found');
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  await dbPut('users', { ...user, passwordHash, updatedAt: new Date().toISOString() });
}
