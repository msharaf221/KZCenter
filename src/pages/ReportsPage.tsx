import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import Layout from '../components/layout/Layout';
import { dbGetAll } from '../lib/db';
import type { Student, Teacher, Course, Group, Payment, Expense } from '../lib/db';
import { formatCurrency, toCSV, downloadCSV } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { Download, Printer } from 'lucide-react';
import { notify } from '../lib/notifications';
import dayjs from 'dayjs';

const GENDER_COLORS = ['#6366f1', '#ec4899'];
const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', suspended: '#f97316', ended: '#94a3b8',
};

export default function ReportsPage() {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, t, c, g, p, e] = await Promise.all([
        dbGetAll<Student>('students'),
        dbGetAll<Teacher>('teachers'),
        dbGetAll<Course>('courses'),
        dbGetAll<Group>('groups'),
        dbGetAll<Payment>('payments'),
        dbGetAll<Expense>('expenses'),
      ]);
      setStudents(s); setTeachers(t); setCourses(c);
      setGroups(g); setPayments(p); setExpenses(e);
    } finally { setLoading(false); }
  }

  // Gender data
  const genderData = [
    { name: 'ذكور', value: students.filter(s => s.gender === 'male').length },
    { name: 'إناث', value: students.filter(s => s.gender === 'female').length },
  ];

  // Status data
  const statusData = [
    { name: 'نشط', value: students.filter(s => s.status === 'active').length, color: STATUS_COLORS.active },
    { name: 'متوقف', value: students.filter(s => s.status === 'suspended').length, color: STATUS_COLORS.suspended },
    { name: 'منتهي', value: students.filter(s => s.status === 'ended').length, color: STATUS_COLORS.ended },
  ];

  // Age distribution
  const ageGroups = [
    { name: '3-6', value: students.filter(s => s.age >= 3 && s.age <= 6).length },
    { name: '7-9', value: students.filter(s => s.age >= 7 && s.age <= 9).length },
    { name: '10-12', value: students.filter(s => s.age >= 10 && s.age <= 12).length },
    { name: '13-15', value: students.filter(s => s.age >= 13 && s.age <= 15).length },
    { name: '16-18', value: students.filter(s => s.age >= 16 && s.age <= 18).length },
  ];

  // Course enrollment
  const courseData = courses.map(c => ({
    name: c.name.substring(0, 15),
    students: groups.filter(g => g.courseId === c.id).reduce((sum, g) => sum + g.studentIds.length, 0),
  })).sort((a, b) => b.students - a.students);

  // Group fill rate
  const groupFillData = groups.map(g => {
    const course = courses.find(c => c.id === g.courseId);
    return {
      name: g.name.substring(0, 12),
      fill: g.maxStudents > 0 ? Math.round((g.studentIds.length / g.maxStudents) * 100) : 0,
      course: course?.name || '',
    };
  });

  // Monthly revenue vs expenses (last 6 months)
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const m = dayjs().subtract(i, 'month');
    const key = m.format('YYYY-MM');
    const revenue = payments.filter(p => p.status === 'paid' && p.date.startsWith(key)).reduce((s, p) => s + p.amount, 0);
    const expense = expenses.filter(e => e.date.startsWith(key)).reduce((s, e) => s + e.amount, 0);
    monthlyData.push({ month: m.format('MMM'), revenue, expense, profit: revenue - expense });
  }

  // Teacher performance
  const teacherData = teachers.map(t => {
    const teacherGroups = groups.filter(g => g.teacherId === t.id);
    const teacherStudents = teacherGroups.reduce((sum, g) => sum + g.studentIds.length, 0);
    return { name: t.name.substring(0, 12), groups: teacherGroups.length, students: teacherStudents };
  }).filter(t => t.groups > 0);

  // Expense categories
  const expenseCategories: Record<string, number> = {};
  expenses.forEach(e => { expenseCategories[e.category] = (expenseCategories[e.category] || 0) + e.amount; });
  const expensePieData = Object.entries(expenseCategories).map(([cat, amount]) => ({
    name: { salaries: 'رواتب', bills: 'فواتير', maintenance: 'صيانة', purchases: 'مشتريات', rent: 'إيجار', other: 'أخرى' }[cat] || cat,
    value: amount,
  }));
  const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4'];

  const totalRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  function exportReport() {
    const data = students.map(s => ({
      name: s.name, age: s.age, gender: s.gender === 'male' ? 'ذكر' : 'أنثى',
      status: s.status === 'active' ? 'نشط' : s.status === 'suspended' ? 'متوقف' : 'منتهي',
      totalPaid: s.totalPaid, parentPhone: s.parentPhone,
    }));
    const csv = toCSV(data as unknown as Record<string, unknown>[], [
      { key: 'name', label: 'الاسم' }, { key: 'age', label: 'العمر' },
      { key: 'gender', label: 'الجنس' }, { key: 'status', label: 'الحالة' },
      { key: 'totalPaid', label: 'إجمالي المدفوع' }, { key: 'parentPhone', label: 'هاتف ولي الأمر' },
    ]);
    downloadCSV(csv, 'students_report.csv');
    notify.success('تم تصدير التقرير');
  }

  if (loading) {
    return (
      <Layout title="التقارير والإحصائيات">
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
      </Layout>
    );
  }

  return (
    <Layout title="التقارير والإحصائيات">
      <div className="space-y-6">
        {/* Top actions */}
        <div className="flex gap-3 justify-end">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 no-print">
            <Printer size={16} /> طباعة
          </button>
          <button onClick={exportReport} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 no-print">
            <Download size={16} /> تصدير CSV
          </button>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">إجمالي الإيرادات</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">إجمالي المصروفات</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalExpenses, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">صافي الربح</p>
            <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
              {formatCurrency(netProfit, settings?.currency)}
            </p>
          </div>
        </div>

        {/* Revenue vs Expenses */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-gray-900 mb-4">الإيرادات والمصروفات (آخر 6 أشهر)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n) => [formatCurrency(Number(v), settings?.currency), n === 'revenue' ? 'إيرادات' : n === 'expense' ? 'مصروفات' : 'ربح']} />
              <Legend formatter={v => v === 'revenue' ? 'إيرادات' : v === 'expense' ? 'مصروفات' : 'ربح'} />
              <Bar dataKey="revenue" fill={primaryColor} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Row 1: Gender + Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">توزيع الجنس</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={genderData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {genderData.map((_, i) => <Cell key={i} fill={GENDER_COLORS[i]} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">توزيع حالة الطلاب</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((item, i) => <Cell key={i} fill={item.color} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 2: Age distribution + Course enrollment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">توزيع الأعمار</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ageGroups}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill={primaryColor} radius={[4, 4, 0, 0]} name="عدد الطلاب" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">الكورسات (عدد الطلاب)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={courseData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="students" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="الطلاب" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 3: Group fill rate + Teacher performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">نسبة امتلاء المجموعات</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={groupFillData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, 'نسبة الامتلاء']} />
                <Bar dataKey="fill" radius={[4, 4, 0, 0]} name="الامتلاء">
                  {groupFillData.map((item, i) => (
                    <Cell key={i} fill={item.fill >= 90 ? '#ef4444' : item.fill >= 70 ? '#f97316' : primaryColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">أداء المدرسين</h3>
            {teacherData.length === 0 ? (
              <p className="text-center text-gray-400 py-8">لا توجد بيانات</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teacherData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend formatter={v => v === 'groups' ? 'مجموعات' : 'طلاب'} />
                  <Bar dataKey="groups" fill={primaryColor} radius={[4, 4, 0, 0]} name="groups" />
                  <Bar dataKey="students" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="students" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Expense categories */}
        {expensePieData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">توزيع المصروفات حسب الفئة</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" label={({ name, value }) => `${name}: ${formatCurrency(value, settings?.currency)}`}>
                  {expensePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Layout>
  );
}
