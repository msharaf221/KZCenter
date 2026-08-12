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

// ==================== DB INIT ====================

const DB_NAME = 'EduCenterProDB';
const DB_VERSION = 4;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: IDBPDatabase<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDB(): Promise<IDBPDatabase<any>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
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
    },
  });

  return dbInstance;
}

// ==================== SEED DATA ====================

export async function seedDefaultData(): Promise<void> {
  console.log('🌱 Seeding default data...');
  const db = await getDB();

  const users = await db.getAll('users');
  console.log('👥 Existing users:', users.length);
  
  if (users.length === 0) {
    console.log('🔐 Creating admin user...');
    const passwordHash = bcrypt.hashSync('admin123', 10);
    console.log('🔑 Password hash created');
    const adminUser: User = {
      id: generateId(),
      username: 'admin',
      passwordHash,
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.add('users', adminUser);
    console.log('✅ Admin user created');
  } else {
    console.log('👤 Admin user already exists');
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
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// ==================== GENERIC CRUD ====================

type StoreName =
  | 'students' | 'teachers' | 'courses' | 'groups'
  | 'payments' | 'attendance' | 'users' | 'settings'
  | 'expenses' | 'exams' | 'grades';

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
    
  let totalOwed = 0;
  if (student.enrolledGroups && student.enrolledGroups.length > 0) {
    const groups = await dbGetAll<Group>('groups');
    const courses = await dbGetAll<Course>('courses');
    
    for (const groupId of student.enrolledGroups) {
      const group = groups.find(g => g.id === groupId);
      if (group) {
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
  const [students, teachers, courses, groups, payments, attendance, expenses, exams, grades] =
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
    ]);
  const settings = await db.get('settings', 'main');

  return {
    version: 3,
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
  };
}

export async function importAllData(data: Record<string, unknown>): Promise<void> {
  const stores: StoreName[] = [
    'students', 'teachers', 'courses', 'groups',
    'payments', 'attendance', 'expenses', 'exams', 'grades'
  ];

  for (const store of stores) {
    await dbClearStore(store);
    const items = data[store];
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
