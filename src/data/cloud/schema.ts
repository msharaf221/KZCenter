import schemaSql from '../../../supabase_schema.sql?raw';

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
          total_owed: number;
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
          must_change_password: boolean;
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
      inventory: {
        Row: {
          id: string;
          name: string;
          type: 'book' | 'handout' | 'other';
          cost_price: number;
          sell_price: number;
          stock: number;
          course_id: string | null;
          created_at: string;
          updated_at: string;
          deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>;
      };
      inventory_transactions: {
        Row: {
          id: string;
          item_id: string;
          type: 'in' | 'out';
          quantity: number;
          price: number;
          student_id: string | null;
          date: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['inventory_transactions']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['inventory_transactions']['Insert']>;
      };
    };
  };
}

// ==================== SQL SCHEMA ====================
// يتم تحميل الـ Schema من ملف supabase_schema.sql (مصدر واحد للحقيقة)
// عشان نضمن إن زر "نسخ الـ Schema" في الإعدادات بيطابق الملف الفعلي.
export const SQL_SCHEMA: string = schemaSql;
