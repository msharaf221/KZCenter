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
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('subscription', 'books', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'late')),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

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
  language TEXT DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
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
  initial_payment DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE,
  UNIQUE(student_id, group_id)
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

-- =====================================================
-- البيانات الافتراضية
-- =====================================================

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default settings
INSERT INTO settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Row Level Security (RLS)
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
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_students" ON students FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_teachers" ON teachers FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_courses" ON courses FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_groups" ON groups FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_payments" ON payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_expenses" ON expenses FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_users" ON users FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_settings" ON settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_exams" ON exams FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_grades" ON grades FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_inventory" ON inventory FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_inventory_transactions" ON inventory_transactions FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_backups" ON backups FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "admin_all_enrollments" ON enrollments FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin') WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Teacher read access
CREATE POLICY "teacher_read_students" ON students FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

CREATE POLICY "teacher_read_groups" ON groups FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

CREATE POLICY "teacher_read_courses" ON courses FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

CREATE POLICY "teacher_manage_attendance" ON attendance FOR ALL
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

CREATE POLICY "teacher_read_exams" ON exams FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

CREATE POLICY "teacher_manage_grades" ON grades FOR ALL
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

CREATE POLICY "teacher_read_enrollments" ON enrollments FOR SELECT
  USING (auth.jwt() ->> 'role' IN ('admin', 'teacher'));

-- Settings readable by all
CREATE POLICY "authenticated_read_settings" ON settings FOR SELECT
  USING (auth.role() = 'authenticated');

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
