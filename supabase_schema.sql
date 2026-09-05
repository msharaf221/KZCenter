-- =====================================================
-- EduCenter Pro - Supabase Schema
-- تاريخ الإنشاء: 2024
-- =====================================================
-- انسخ هذا الملف كاملاً في SQL Editor في Supabase
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- الجداول الأساسية
-- =====================================================

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 3 AND age <= 18),
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  phone TEXT,
  parent_phone TEXT NOT NULL,
  avatar TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  total_paid DECIMAL(10,2) DEFAULT 0,
  total_owed DECIMAL(10,2) DEFAULT 0,
  enrolled_groups UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  salary DECIMAL(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacation', 'suspended')),
  avatar TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) DEFAULT 0,
  duration_months INTEGER DEFAULT 1,
  icon TEXT DEFAULT '📚',
  color TEXT DEFAULT '#6366f1',
  levels JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  level_id TEXT,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  schedule JSONB DEFAULT '[]',
  max_students INTEGER DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'full', 'ended')),
  student_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('subscription', 'books', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'late')),
  date DATE NOT NULL,
  notes TEXT,
  installment_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- أعمدة مضافة للإصدارات القائمة (CREATE TABLE IF NOT EXISTS مش بيعدّل جدول موجود)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS installment_ids UUID[] DEFAULT '{}';

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  check_in_time TIME,
  check_out_time TIME,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, group_id, date)
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher')),
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  must_change_password BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  center_name TEXT DEFAULT 'EduCenter Pro',
  address TEXT,
  phone TEXT,
  email TEXT,
  academic_year TEXT,
  currency TEXT DEFAULT 'EGP',
  primary_color TEXT DEFAULT '#6366f1',
  font_size TEXT DEFAULT 'md' CHECK (font_size IN ('sm', 'md', 'lg')),
  dark_mode BOOLEAN DEFAULT FALSE,
  notify_new_student BOOLEAN DEFAULT TRUE,
  notify_absence BOOLEAN DEFAULT TRUE,
  notify_late_payment BOOLEAN DEFAULT TRUE
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL CHECK (category IN ('salaries', 'bills', 'maintenance', 'purchases', 'rent', 'other')),
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Exams table
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  max_grade INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Grades table
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  grade DECIMAL(5,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('book', 'handout', 'other')),
  cost_price DECIMAL(10,2) DEFAULT 0,
  sell_price DECIMAL(10,2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Inventory Transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enrollments table (Single Source of Truth for student-group relationship)
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'dropped', 'completed')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  dropped_at TIMESTAMPTZ,
  drop_reason TEXT,
  start_session INTEGER,
  transferred_to_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  initial_payment DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- ملاحظة: القيد الفريد (student_id, group_id) اتشال لأن التحويل بين المجموعات
-- بيخلي الطالب ممكن يكون ليه أك من سجل تعليم لنفس المجموعة عبر الوقت
-- (واحد قديم بحالة transferred/dropped وواحد نشط).
-- البديل: قيد فريد جزئي على التسجيلات النشطة فقط.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_enrollment
  ON enrollments(student_id, group_id) WHERE status = 'active' AND deleted = FALSE;

-- أعمدة مضافة للإصدارات القائمة
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS start_session INTEGER;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS transferred_to_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- Installments table (الأقساط/المستحقات — وحدة الدين الحقيقية لكل تسجيل)
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  period_index INTEGER NOT NULL DEFAULT 1,
  period_label TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'pending', 'late', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Backups metadata table
CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backup_date TIMESTAMPTZ DEFAULT NOW(),
  size_bytes BIGINT DEFAULT 0,
  status TEXT DEFAULT 'success',
  data_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- الفهارس للأداء
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_students_status ON students(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(parent_phone) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers(name) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_groups_course ON groups(course_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_groups_teacher ON groups(teacher_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_group_date ON attendance(group_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_exams_group ON exams(group_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_grades_exam ON grades(exam_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory(type) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_inventory_course ON inventory(course_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON inventory_transactions(date);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_enrollments_group ON enrollments(group_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_enrollments_student_group ON enrollments(student_id, group_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_installments_student ON installments(student_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_installments_group ON installments(group_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_installments_student_group ON installments(student_id, group_id) WHERE deleted = FALSE;

-- =====================================================
-- البيانات الافتراضية
-- =====================================================

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2b$10$sMcbvzFF0tmnv9jvuMamh.3TjvNKC1PuuGRgursHOpbjSf20T5WFC', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default settings
INSERT INTO settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Row Level Security (RLS) — مُشدَّدة (2026-09)
-- =====================================================
-- ⚠️ مهم جداً — اقرأ قبل التشغيل:
--
-- 1) مفيش أي وصول لدور `anon`. النسخة القديمة من الملف ده كانت بتسمح لـ anon
--    يقرا ويعدّل ويمسح كل الجداول — بما فيها:
--       - `users`   → فيها bcrypt password hashes لكل مستخدمي النظام
--       - `backups` → فيها `data_snapshot` = نسخة كاملة من قاعدة البيانات
--    والـ anon key نفسه مبني في كود العميل، يعني أي حد كان يقدر يسحب كل بيانات
--    المركز (وأسماء الأطفال) من غير أي صلاحية. ده اتقفل هنا.
--
-- 2) التطبيق دلوقتي بيعمل **Supabase Anonymous Sign-In** قبل أي مزامنة
--    (`ensureCloudSession()` في `src/lib/supabase.ts`) عشان الدور يبقى
--    `authenticated`. لازم تفعّله من:
--       Supabase Dashboard → Authentication → Sign In / Up → Anonymous Sign-Ins → ON
--    لو مقفول، المزامنة هتفشل برسالة واضحة (مش بصمت زي قبل كده).
--
-- 3) جدول `users` **مقفول بالكامل** (RLS شغال ومن غير أي سياسة = رفض الكل).
--    مستخدمو النظام وكلمات مرورهم محليين في IndexedDB ومالهمش داعي في السحابة.
--
-- 4) السياسات هنا idempotent: تعمل DROP POLICY IF EXISTS قبل CREATE، فتنفع
--    تشغّل الملف أكتر من مرة من غير أخطاء.
--
-- 5) لو هتنقل المصادقة لـ Supabase Auth (مستحسن لأي deployment عام):
--    شوف القسم الأخير «المرحلة التالية: عزل لكل مستخدم» في آخر الملف.
-- =====================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- إزالة السياسات القديمة المفتوحة (لو المشروع متعمل قبل كده)
DROP POLICY IF EXISTS "app_all_students" ON students;
DROP POLICY IF EXISTS "app_all_teachers" ON teachers;
DROP POLICY IF EXISTS "app_all_courses" ON courses;
DROP POLICY IF EXISTS "app_all_groups" ON groups;
DROP POLICY IF EXISTS "app_all_payments" ON payments;
DROP POLICY IF EXISTS "app_all_attendance" ON attendance;
DROP POLICY IF EXISTS "app_all_users" ON users;
DROP POLICY IF EXISTS "app_all_settings" ON settings;
DROP POLICY IF EXISTS "app_all_expenses" ON expenses;
DROP POLICY IF EXISTS "app_all_exams" ON exams;
DROP POLICY IF EXISTS "app_all_grades" ON grades;
DROP POLICY IF EXISTS "app_all_inventory" ON inventory;
DROP POLICY IF EXISTS "app_all_inventory_transactions" ON inventory_transactions;
DROP POLICY IF EXISTS "app_all_enrollments" ON enrollments;
DROP POLICY IF EXISTS "app_all_installments" ON installments;
DROP POLICY IF EXISTS "app_all_backups" ON backups;

-- سياسات authenticated-only (للمزامنة من التطبيق بعد anonymous sign-in)
DROP POLICY IF EXISTS "app_sync_students" ON students;
CREATE POLICY "app_sync_students" ON students FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_teachers" ON teachers;
CREATE POLICY "app_sync_teachers" ON teachers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_courses" ON courses;
CREATE POLICY "app_sync_courses" ON courses FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_groups" ON groups;
CREATE POLICY "app_sync_groups" ON groups FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_payments" ON payments;
CREATE POLICY "app_sync_payments" ON payments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_attendance" ON attendance;
CREATE POLICY "app_sync_attendance" ON attendance FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_settings" ON settings;
CREATE POLICY "app_sync_settings" ON settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_expenses" ON expenses;
CREATE POLICY "app_sync_expenses" ON expenses FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_exams" ON exams;
CREATE POLICY "app_sync_exams" ON exams FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_grades" ON grades;
CREATE POLICY "app_sync_grades" ON grades FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_inventory" ON inventory;
CREATE POLICY "app_sync_inventory" ON inventory FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_inventory_transactions" ON inventory_transactions;
CREATE POLICY "app_sync_inventory_transactions" ON inventory_transactions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_enrollments" ON enrollments;
CREATE POLICY "app_sync_enrollments" ON enrollments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_installments" ON installments;
CREATE POLICY "app_sync_installments" ON installments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "app_sync_backups" ON backups;
CREATE POLICY "app_sync_backups" ON backups FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- جدول `users`: مقفول بالكامل (مفيش سياسة = RLS بيرفض كل حاجة).
-- كلمات مرور النظام المحلي مش بتترفع للسحابة إطلاقاً (شوف CLOUD_TABLES في
-- src/lib/storage.ts). لو محتاج تخزن مستخدمين في السحابة مستقبلاً، استخدم
-- Supabase Auth + جدول `app_users` في القسم الأخير.

-- =====================================================
-- Functions & Triggers
-- =====================================================
-- =====================================================
-- Functions & Triggers
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installments_updated_at BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- المرحلة التالية: عزل لكل مستخدم (Supabase Auth)
-- =====================================================
-- القسم ده **متعطّل** (كله comments). فعّله لما تنقل المصادقة من IndexedDB
-- لـ Supabase Auth — وده مطلوب لأي deployment على النت بأكتر من مستخدم:
--   • كل مستخدم بيشوف بيانات مركزه هو بس
--   • أدوار (admin / secretary / accountant / teacher) enforced في القاعدة نفسها
--   • مفيش اعتماد على حماية في المتصفح (اللي ممكن تجاوزها من DevTools)
--
-- خطوات التفعيل:
--   1) شيل علامات التعليق من الكود ده وشغّله في SQL Editor.
--   2) احذف السياسات `app_sync_*` اللي فوق (أو خليها للمسؤول فقط).
--   3) في التطبيق: supabase.auth.signUp / signInWithPassword بدل تسجيل الدخول المحلي،
--      واحفظ role + center_id في `app_users` من طرف مسؤول المشروع (مش من العميل).
--
-- CREATE TABLE IF NOT EXISTS app_users (
--   auth_uid  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   center_id UUID NOT NULL,
--   role      TEXT NOT NULL CHECK (role IN ('owner','admin','secretary','accountant','supervisor','teacher')),
--   teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );
-- ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "app_users_self_read" ON app_users FOR SELECT
--   TO authenticated USING (auth_uid = auth.uid());
--
-- -- مركز واحد لكل صف: أضف center_id للجداول (أو جدول ربط group↔center)
-- ALTER TABLE students  ADD COLUMN IF NOT EXISTS center_id UUID;
-- ALTER TABLE groups    ADD COLUMN IF NOT EXISTS center_id UUID;
-- ALTER TABLE payments  ADD COLUMN IF NOT EXISTS center_id UUID;
--
-- -- دوال مساعدة (SECURITY DEFINER عشان تقرا app_users رغم RLS)
-- CREATE OR REPLACE FUNCTION current_center() RETURNS UUID
-- LANGUAGE sql SECURITY DEFINER STABLE AS $$
--   SELECT center_id FROM app_users WHERE auth_uid = auth.uid()
-- $$;
--
-- CREATE OR REPLACE FUNCTION current_role() RETURNS TEXT
-- LANGUAGE sql SECURITY DEFINER STABLE AS $$
--   SELECT role FROM app_users WHERE auth_uid = auth.uid()
-- $$;
--
-- CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN
-- LANGUAGE sql SECURITY DEFINER STABLE AS $$
--   SELECT COALESCE(current_role() IN ('owner','admin','secretary','accountant','supervisor'), FALSE)
-- $$;
--
-- -- مثال سياسات لكل جدول:
-- DROP POLICY IF EXISTS "app_sync_students" ON students;
-- CREATE POLICY "students_center_isolation" ON students FOR ALL TO authenticated
--   USING (center_id = current_center())
--   WITH CHECK (center_id = current_center());
--
-- -- المدرس: قراءة لطلابه فقط (عن طريق مجموعاته) وكتابة حضور بس
-- CREATE POLICY "students_teacher_read" ON students FOR SELECT TO authenticated
--   USING (
--     current_role() = 'teacher' AND EXISTS (
--       SELECT 1 FROM enrollments e JOIN groups g ON g.id = e.group_id
--       WHERE e.student_id = students.id AND g.teacher_id = (SELECT teacher_id FROM app_users WHERE auth_uid = auth.uid())
--     )
--   );
--
-- -- الفلوس للمسؤول/المحاسب فقط
-- CREATE POLICY "payments_staff_only" ON payments FOR ALL TO authenticated
--   USING (is_staff()) WITH CHECK (is_staff());
--
-- -- النسخ الاحتياطية للمسؤول فقط
-- CREATE POLICY "backups_owner_only" ON backups FOR ALL TO authenticated
--   USING (current_role() IN ('owner','admin')) WITH CHECK (current_role() IN ('owner','admin'));
