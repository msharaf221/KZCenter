import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import Layout from '../components/layout/Layout';
import { dbGetAll, getRefunds, installmentRemaining } from '../lib/db';
import type { Student, Teacher, Course, Group, Payment, Expense, Refund, Installment } from '../lib/db';
import { formatCurrency, formatDate, toCSV, downloadCSV } from '../lib/utils';
import { calcGroupProfitability, type GroupProfit } from '../lib/payroll';
import { debtAging, upcomingDues, AGING_RANGES } from '../lib/billing';
import { useApp } from '../contexts/AppContext';
import { Download, Printer, Calendar, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
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
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);

  // فترة التقرير — كان ثابت على «آخر 6 أشهر» من غير اختيار
  const [from, setFrom] = useState(dayjs().subtract(6, 'month').startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [profitability, setProfitability] = useState<GroupProfit[]>([]);
  const [profitLoading, setProfitLoading] = useState(false);

  // ربحية المجموعات بتتحسب في lib/payroll (بتقرا الأقساط والحضور والسلف من القاعدة)
  useEffect(() => {
    let cancelled = false;
    setProfitLoading(true);
    calcGroupProfitability({ from, to })
      .then(rows => { if (!cancelled) setProfitability(rows); })
      .catch(() => { if (!cancelled) setProfitability([]); })
      .finally(() => { if (!cancelled) setProfitLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  async function load() {
    setLoading(true);
    try {
      const [s, t, c, g, p, e, r, ins] = await Promise.all([
        dbGetAll<Student>('students'),
        dbGetAll<Teacher>('teachers'),
        dbGetAll<Course>('courses'),
        dbGetAll<Group>('groups'),
        dbGetAll<Payment>('payments'),
        dbGetAll<Expense>('expenses'),
        getRefunds(),
        dbGetAll<Installment>('installments'),
      ]);
      setStudents(s); setTeachers(t); setCourses(c);
      setGroups(g); setPayments(p); setExpenses(e);
      setRefunds(r); setInstallments(ins);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
  }, []);

  // Gender data
  const genderData = [
    { name: 'أولاد', value: students.filter(s => s.gender === 'male').length },
    { name: 'بنات', value: students.filter(s => s.gender === 'female').length },
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
    name: c.name.length > 20 ? c.name.substring(0, 18) + '…' : c.name,
    students: groups.filter(g => g.courseId === c.id).reduce((sum, g) => sum + g.studentIds.length, 0),
  })).sort((a, b) => b.students - a.students);

  // Group fill rate
  const groupFillData = groups.map(g => {
    const course = courses.find(c => c.id === g.courseId);
    return {
      name: g.name.length > 18 ? g.name.substring(0, 16) + '…' : g.name,
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
    return { name: t.name.length > 18 ? t.name.substring(0, 16) + '…' : t.name, groups: teacherGroups.length, students: teacherStudents };
  }).filter(t => t.groups > 0);

  // Expense categories
  const expenseCategories: Record<string, number> = {};
  expenses.forEach(e => { expenseCategories[e.category] = (expenseCategories[e.category] || 0) + e.amount; });
  const expensePieData = Object.entries(expenseCategories).map(([cat, amount]) => ({
    name: { salaries: 'رواتب', bills: 'فواتير', maintenance: 'صيانة', purchases: 'مشتريات', rent: 'إيجار', other: 'أخرى' }[cat] || cat,
    value: amount,
  }));
  const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4'];

  // ===== أرقام الفترة المختارة =====
  const inRange = (date: string) => date >= from && date <= to;
  /** الإيراد المحسوب = المدفوع غير الملغي − الاستردادات (مش مجرد sum للدفعات) */
  const rangePayments = payments.filter(p => p.status === 'paid' && !p.voided && inRange(p.date));
  const rangeRefunds = refunds.filter(r => inRange(r.date));
  const rangeExpenses = expenses.filter(e => inRange(e.date));

  const totalRevenue = rangePayments.reduce((s, p) => s + p.amount, 0);
  const totalRefunds = rangeRefunds.reduce((s, r) => s + r.amount, 0);
  const netRevenue = totalRevenue - totalRefunds;
  const totalExpenses = rangeExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = netRevenue - totalExpenses;
  const byMethod = rangePayments.reduce<Record<string, number>>((acc, p) => {
    const m = p.method || 'cash';
    acc[m] = (acc[m] || 0) + p.amount;
    return acc;
  }, {});

  // ===== أعمار الديون =====
  const debtBuckets = debtAging(installments);

  // ===== استحقاقات قريبة =====
  const upcoming = upcomingDues(installments, settings?.upcomingDueDays ?? 3);

  // ===== ربحية المجموعات (بتتحمل من القاعدة على الفترة المختارة) =====

  function exportReport() {
    const data = students.map(s => ({
      name: s.name, age: s.age, gender: s.gender === 'male' ? 'ولد' : 'بنت',
      status: s.status === 'active' ? 'نشط' : s.status === 'suspended' ? 'متوقف' : 'منتهي',
      totalPaid: s.totalPaid, parentPhone: s.parentPhone,
    }));
    const csv = toCSV(data as unknown as Record<string, unknown>[], [
      { key: 'name', label: 'الاسم' }, { key: 'age', label: 'العمر' },
      { key: 'gender', label: 'النوع' }, { key: 'status', label: 'الحالة' },
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
        {/* Top actions + period picker */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Calendar size={16} className="text-gray-400" /> فترة التقرير
            </div>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex gap-1.5">
              {[
                { label: 'هذا الشهر', f: dayjs().startOf('month').format('YYYY-MM-DD'), t: dayjs().format('YYYY-MM-DD') },
                { label: 'آخر 3 أشهر', f: dayjs().subtract(3, 'month').startOf('month').format('YYYY-MM-DD'), t: dayjs().format('YYYY-MM-DD') },
                { label: 'آخر 6 أشهر', f: dayjs().subtract(6, 'month').startOf('month').format('YYYY-MM-DD'), t: dayjs().format('YYYY-MM-DD') },
                { label: 'السنة دي', f: dayjs().startOf('year').format('YYYY-MM-DD'), t: dayjs().format('YYYY-MM-DD') },
              ].map(q => (
                <button key={q.label} onClick={() => { setFrom(q.f); setTo(q.t); }}
                  className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                  {q.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mr-auto">
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                <Printer size={16} /> طباعة
              </button>
              <button onClick={exportReport} className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                <Download size={16} /> تصدير CSV
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            من {formatDate(from)} إلى {formatDate(to)} — كل الأرقام المالية تحت محسوبة على الفترة دي
          </p>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">إجمالي المحصل</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue, settings?.currency)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{rangePayments.length} دفعة</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">المسترد</p>
            <p className="text-2xl font-bold text-orange-500">{formatCurrency(totalRefunds, settings?.currency)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{rangeRefunds.length} عملية</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">إجمالي المصروفات</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalExpenses, settings?.currency)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{rangeExpenses.length} بند</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">صافي الربح</p>
            <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
              {formatCurrency(netProfit, settings?.currency)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">بعد خصم المسترد والمصروفات</p>
          </div>
        </div>

        {/* التحصيل حسب طريقة الدفع */}
        {Object.keys(byMethod).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-3">التحصيل حسب طريقة الدفع</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(byMethod) as [string, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([m, v]) => (
                  <div key={m} className="px-3 py-2 bg-gray-50 rounded-xl text-xs">
                    <span className="text-gray-500">{({ cash: 'نقدي', wallet: 'محفظة', instapay: 'انستاباي', card: 'بطاقة', bank: 'تحويل بنكي', other: 'أخرى' } as Record<string, string>)[m] || m}: </span>
                    <span className="font-bold text-gray-900">{formatCurrency(v, settings?.currency)}</span>
                    <span className="text-gray-400"> ({totalRevenue > 0 ? Math.round((v / totalRevenue) * 100) : 0}%)</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* أعمار الديون */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
            <AlertTriangle size={17} className="text-amber-500" /> أعمار الديون (Aging)
          </h3>
          <p className="text-xs text-gray-400 mb-4">توزيع المتأخرات على الطلاب حسب مدة التأخير — بيقول لك فين الفلوس الضايعة</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AGING_RANGES.map((range, idx) => {
              const b = debtBuckets.find(x => x.key === range.key);
              const styles = [
                { bg: '#f0fdf4', color: '#15803d' },
                { bg: '#fefce8', color: '#a16207' },
                { bg: '#fff7ed', color: '#c2410c' },
                { bg: '#fef2f2', color: '#b91c1c' },
                { bg: '#fdf2f8', color: '#9d174d' },
              ][idx] || { bg: '#f8fafc', color: '#475569' };
              return (
                <div key={range.key} className="p-3 rounded-xl border border-gray-100" style={{ backgroundColor: styles.bg }}>
                  <p className="text-[11px] font-bold mb-1" style={{ color: styles.color }}>{range.label}</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(b?.amount || 0, settings?.currency)}</p>
                  <p className="text-[11px] text-gray-500">{b?.count || 0} قسط</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* استحقاقات قريبة */}
        {upcoming.count > 0 && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Clock size={17} className="text-indigo-500" /> استحقاقات قريبة
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {upcoming.count} قسط بإجمالي {formatCurrency(upcoming.amount, settings?.currency)} مستحقين خلال {settings?.upcomingDueDays ?? 3} يوم — التنبيه قبل التأخر بيرفع التحصيل
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-right text-xs text-gray-500">
                    <th className="px-4 py-2.5 font-medium">الطالب</th>
                    <th className="px-4 py-2.5 font-medium">الاستحقاق</th>
                    <th className="px-4 py-2.5 font-medium">المتبقي</th>
                    <th className="px-4 py-2.5 font-medium">فاضل</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.items.slice(0, 12).map(i => (
                    <tr key={i.id} className="border-t border-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {students.find(st => st.id === i.studentId)?.name || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{formatDate(i.dueDate)}</td>
                      <td className="px-4 py-2.5 font-bold text-gray-900">{formatCurrency(installmentRemaining(i), settings?.currency)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${i.daysUntilDue <= 1 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {i.daysUntilDue === 0 ? 'النهاردة' : `${i.daysUntilDue} يوم`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ربحية المجموعات */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
            <TrendingUp size={17} className="text-emerald-600" /> ربحية المجموعات
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            إيراد المجموعة = عدد الطلاب × سعرها الشهري (بالخصومات الفعلية) · التكلفة = حصة المدرس من مرتبه
          </p>
          {profitLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">جاري حساب الربحية...</p>
          ) : profitability.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">مفيش مجموعات محسوب لها ربحية لسه</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-right text-xs text-gray-500">
                    <th className="px-4 py-2.5 font-medium">المجموعة</th>
                    <th className="px-4 py-2.5 font-medium">المدرس</th>
                    <th className="px-4 py-2.5 font-medium">الطلاب</th>
                    <th className="px-4 py-2.5 font-medium">المحصّل</th>
                    <th className="px-4 py-2.5 font-medium">المستحق</th>
                    <th className="px-4 py-2.5 font-medium">تكلفة المدرس</th>
                    <th className="px-4 py-2.5 font-medium">الملازم</th>
                    <th className="px-4 py-2.5 font-medium">صافي الربح</th>
                    <th className="px-4 py-2.5 font-medium">الهامش</th>
                  </tr>
                </thead>
                <tbody>
                  {[...profitability].sort((a, b) => b.profit - a.profit).map(r => (
                    <tr key={r.groupId} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {r.groupName}
                        <span className="block text-[10px] text-gray-400 font-normal">{r.courseName}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{r.teacherName || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.students}</td>
                      <td className="px-4 py-2.5 text-green-700 font-medium">{formatCurrency(r.collected, settings?.currency)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{formatCurrency(r.owed, settings?.currency)}</td>
                      <td className="px-4 py-2.5 text-red-600">{formatCurrency(r.teacherCost, settings?.currency)}</td>
                      <td className="px-4 py-2.5 text-red-500 text-xs">{formatCurrency(r.materialCost, settings?.currency)}</td>
                      <td className={`px-4 py-2.5 font-bold ${r.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {formatCurrency(r.profit, settings?.currency)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          r.marginPct >= 50 ? 'bg-green-100 text-green-700'
                          : r.marginPct >= 25 ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'}`}>
                          {Math.round(r.marginPct)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
            <h3 className="text-base font-bold text-gray-900 mb-4">أولاد و بنات</h3>
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
