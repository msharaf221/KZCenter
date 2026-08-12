import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==================== SUPABASE CONFIG ====================
// يمكن تغيير هذه القيم لاحقاً للاتصال بمشروع Supabase حقيقي
// حالياً النظام يعمل بـ IndexedDB محلياً

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kypwixehrnfbbqjkwlgm.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cHdpeGVocm5mYmJxamt3bGdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MzQ0MDAsImV4cCI6MjEwMjExMDQwMH0.OInu1QTVyZ8EKa06I4xXGKyW-aLoNLSo1p8S5ZieGYU';

// Check if Supabase is configured
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Create client only if configured
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ==================== DATABASE TYPES ====================

export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
          id: string;
          name: string;
          age: number;
          gender: 'male' | 'female';
          phone: string | null;
          parent_phone: string;
          avatar: string | null;
          notes: string | null;
          status: 'active' | 'suspended' | 'ended';
          total_paid: number;
          enrolled_groups: string[];
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['students']['Insert']>;
      };
      teachers: {
        Row: {
          id: string;
          name: string;
          specialization: string;
          phone: string;
          email: string | null;
          salary: number;
          status: 'active' | 'vacation' | 'suspended';
          avatar: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['teachers']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['teachers']['Insert']>;
      };
      courses: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string | null;
          price: number;
          duration_months: number;
          icon: string;
          color: string;
          levels: object[];
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['courses']['Insert']>;
      };
      groups: {
        Row: {
          id: string;
          name: string;
          course_id: string;
          level_id: string | null;
          teacher_id: string;
          schedule: object[];
          max_students: number;
          status: 'open' | 'full' | 'ended';
          student_ids: string[];
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['groups']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['groups']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          student_id: string;
          course_id: string | null;
          amount: number;
          type: 'subscription' | 'books' | 'other';
          status: 'paid' | 'pending' | 'late';
          date: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };
      attendance: {
        Row: {
          id: string;
          student_id: string;
          group_id: string;
          date: string;
          status: 'present' | 'absent' | 'late' | 'excused';
          check_in_time: string | null;
          check_out_time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['attendance']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['attendance']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          username: string;
          password_hash: string;
          role: 'admin' | 'teacher';
          teacher_id: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      settings: {
        Row: {
          id: string;
          center_name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          academic_year: string | null;
          currency: string;
          primary_color: string;
          font_size: 'sm' | 'md' | 'lg';
          language: 'ar' | 'en';
          dark_mode: boolean;
          notify_new_student: boolean;
          notify_absence: boolean;
          notify_late_payment: boolean;
        };
        Insert: Database['public']['Tables']['settings']['Row'];
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
      };
      expenses: {
        Row: {
          id: string;
          category: 'salaries' | 'bills' | 'maintenance' | 'purchases' | 'rent' | 'other';
          amount: number;
          description: string;
          date: string;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
      };
      exams: {
        Row: {
          id: string;
          name: string;
          group_id: string;
          date: string;
          max_grade: number;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['exams']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['exams']['Insert']>;
      };
      grades: {
        Row: {
          id: string;
          exam_id: string;
          student_id: string;
          grade: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['grades']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['grades']['Insert']>;
      };
    };
  };
}

// ==================== SQL SCHEMA ====================
// استخدم هذا الـ SQL لإنشاء الجداول في Supabase

export const SQL_SCHEMA = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  course_id UUID REFERENCES courses(id),
  level_id TEXT,
  teacher_id UUID REFERENCES teachers(id),
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
  student_id UUID REFERENCES students(id),
  course_id UUID REFERENCES courses(id),
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
  student_id UUID REFERENCES students(id),
  group_id UUID REFERENCES groups(id),
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
  teacher_id UUID REFERENCES teachers(id),
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
  group_id UUID REFERENCES groups(id),
  date DATE NOT NULL,
  max_grade INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted BOOLEAN DEFAULT FALSE
);

-- Grades table
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID REFERENCES exams(id),
  student_id UUID REFERENCES students(id),
  grade DECIMAL(5,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(parent_phone) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_teachers_status ON teachers(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_groups_course ON groups(course_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_groups_teacher ON groups(teacher_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_group_date ON attendance(group_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date) WHERE deleted = FALSE;

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2a$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZ', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert default settings
INSERT INTO settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
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

-- Create policies (allow all for authenticated users - customize as needed)
CREATE POLICY "Allow all for authenticated" ON students FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON teachers FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON courses FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON groups FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON payments FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON attendance FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON users FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON settings FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON expenses FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON exams FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON grades FOR ALL USING (true);
`;

// Helper to check connection
export async function testSupabaseConnection(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('settings').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
