-- Supabase Database Schema for EduCenter Pro
-- You can run this in the Supabase SQL Editor

-- Enable UUID extension if you want to use UUIDs later, but since the app uses custom text IDs (like generateId()), we use TEXT for primary keys to ensure compatibility with existing IndexedDB data.

-- 1. Students
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT NOT NULL,
    phone TEXT,
    parentPhone TEXT NOT NULL,
    avatar TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    totalPaid NUMERIC NOT NULL DEFAULT 0,
    totalOwed NUMERIC DEFAULT 0,
    enrolledGroups JSONB DEFAULT '[]'::jsonb,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 2. Teachers
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialization TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    salary NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    avatar TEXT,
    notes TEXT,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 3. Courses
CREATE TABLE IF NOT EXISTS public.courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL DEFAULT 0,
    durationMonths INTEGER NOT NULL DEFAULT 1,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    levels JSONB DEFAULT '[]'::jsonb,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 4. Groups
CREATE TABLE IF NOT EXISTS public.groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    courseId TEXT NOT NULL,
    levelId TEXT,
    teacherId TEXT NOT NULL,
    schedule JSONB DEFAULT '[]'::jsonb,
    maxStudents INTEGER NOT NULL DEFAULT 20,
    status TEXT NOT NULL DEFAULT 'open',
    studentIds JSONB DEFAULT '[]'::jsonb,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 5. Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    studentId TEXT NOT NULL,
    courseId TEXT,
    amount NUMERIC NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid',
    date DATE NOT NULL,
    notes TEXT,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 6. Attendance
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    studentId TEXT NOT NULL,
    groupId TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL,
    checkInTime TEXT,
    checkOutTime TEXT,
    notes TEXT,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Users
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    teacherId TEXT,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 8. Settings
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY,
    centerName TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    academicYear TEXT,
    currency TEXT NOT NULL DEFAULT 'EGP',
    primaryColor TEXT NOT NULL DEFAULT '#6366f1',
    fontSize TEXT NOT NULL DEFAULT 'md',
    language TEXT NOT NULL DEFAULT 'ar',
    darkMode BOOLEAN DEFAULT false,
    notifyNewStudent BOOLEAN DEFAULT true,
    notifyAbsence BOOLEAN DEFAULT true,
    notifyLatePayment BOOLEAN DEFAULT true
);

-- 9. Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    description TEXT NOT NULL,
    date DATE NOT NULL,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 10. Exams
CREATE TABLE IF NOT EXISTS public.exams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    groupId TEXT NOT NULL,
    date DATE NOT NULL,
    maxGrade NUMERIC NOT NULL,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 11. Grades
CREATE TABLE IF NOT EXISTS public.grades (
    id TEXT PRIMARY KEY,
    examId TEXT NOT NULL,
    studentId TEXT NOT NULL,
    grade NUMERIC NOT NULL,
    notes TEXT,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Inventory Items
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    costPrice NUMERIC NOT NULL DEFAULT 0,
    sellPrice NUMERIC NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    courseId TEXT,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

-- 13. Inventory Transactions
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id TEXT PRIMARY KEY,
    itemId TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC NOT NULL,
    studentId TEXT,
    date DATE NOT NULL,
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== INDEXES & RELATIONSHIPS ====================

-- Add foreign key constraints (optional but recommended for data integrity)
-- Note: Commented out because local IndexedDB logic handles soft-deletes and might occasionally break strict FK rules, but you can uncomment them in Supabase if you want strict DB rules.

/*
ALTER TABLE public.groups ADD CONSTRAINT fk_groups_course FOREIGN KEY (courseId) REFERENCES public.courses(id);
ALTER TABLE public.groups ADD CONSTRAINT fk_groups_teacher FOREIGN KEY (teacherId) REFERENCES public.teachers(id);
ALTER TABLE public.payments ADD CONSTRAINT fk_payments_student FOREIGN KEY (studentId) REFERENCES public.students(id);
ALTER TABLE public.attendance ADD CONSTRAINT fk_attendance_student FOREIGN KEY (studentId) REFERENCES public.students(id);
ALTER TABLE public.attendance ADD CONSTRAINT fk_attendance_group FOREIGN KEY (groupId) REFERENCES public.groups(id);
ALTER TABLE public.exams ADD CONSTRAINT fk_exams_group FOREIGN KEY (groupId) REFERENCES public.groups(id);
ALTER TABLE public.grades ADD CONSTRAINT fk_grades_exam FOREIGN KEY (examId) REFERENCES public.exams(id);
ALTER TABLE public.grades ADD CONSTRAINT fk_grades_student FOREIGN KEY (studentId) REFERENCES public.students(id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT fk_invtrans_item FOREIGN KEY (itemId) REFERENCES public.inventory_items(id);
*/

-- ==================== ROW LEVEL SECURITY (RLS) ====================
-- RLS مفعّل افتراضياً على كل الجداول.
-- ⚠️ تحذير: بدون RLS، أي شخص معه الـ anon key يقدر يقرأ ويعدّل كل البيانات.
-- السياسات أدناه تسمح بالوصول للمستخدمين المسجّلين فقط (Supabase Auth).
-- لو التطبيق لا يستخدم Supabase Auth بعد، استبدل TO authenticated
-- بسياسات تناسب طريقة المصادقة عندك — لكن لا تترك الجداول مفتوحة أبداً.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students', 'teachers', 'courses', 'groups', 'payments',
    'attendance', 'users', 'settings', 'expenses', 'exams',
    'grades', 'inventory_items', 'inventory_transactions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_full_access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_full_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
