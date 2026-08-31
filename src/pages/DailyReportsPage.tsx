import { useState, useEffect, useCallback } from 'react';
import { Calendar, DollarSign, TrendingUp, TrendingDown, Printer, Download, ChevronRight, ChevronLeft, Users, CreditCard, Wallet } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import Layout from '../components/layout/Layout';
import { dbGetAll, dbGetByIndex } from '../lib/db';
import type { Payment, Expense, Student, Course } from '../lib/db';
import { formatCurrency, formatDate, toCSV, downloadCSV, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import dayjs from 'dayjs';

const PIE_COLORS = ['#22c55e', '#f97316', '#ef4444'];
const TYPE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899'];

export default function DailyReportsPage() {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';
  
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allP, allE, s, c] = await Promise.all([
        dbGetAll<Payment>('payments'),
        dbGetAll<Expense>('expenses'),
        dbGetAll<Student>('students'),
        dbGetAll<Course>('courses'),
      ]);
      
      setAllPayments(allP);
      setAllExpenses(allE);
      setStudents(s);
      setCourses(c);
      
      // Use indexed queries for selected date's data
      const [dayPayments, dayExpenses] = await Promise.all([
        dbGetByIndex<Payment>('payments', 'by-date', selectedDate),
        dbGetByIndex<Expense>('expenses', 'by-date', selectedDate),
      ]);
      
      setPayments(dayPayments);
      setExpenses(dayExpenses);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  // Navigate dates
  function goToPreviousDay() {
    setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'));
  }
  
  function goToNextDay() {
    const next = dayjs(selectedDate).add(1, 'day');
    if (next.isAfter(dayjs())) return; // Don't go to future
    setSelectedDate(next.format('YYYY-MM-DD'));
  }
  
  function goToToday() {
    setSelectedDate(dayjs().format('YYYY-MM-DD'));
  }

  // Calculate stats
  const todayRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const todayPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const todayLate = payments.filter(p => p.status === 'late').reduce((s, p) => s + p.amount, 0);
  const todayExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const todayProfit = todayRevenue - todayExpenses;
  const totalPaymentsCount = payments.length;
  const paidPaymentsCount = payments.filter(p => p.status === 'paid').length;

  // Yesterday comparison
  const yesterday = dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD');
  const yesterdayRevenue = allPayments
    .filter(p => p.date === yesterday && p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);
  const revenueChange = yesterdayRevenue > 0 
    ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
    : todayRevenue > 0 ? 100 : 0;

  // Payment status distribution
  const statusData = [
    { name: 'مدفوع', value: payments.filter(p => p.status === 'paid').length, amount: todayRevenue },
    { name: 'معلق', value: payments.filter(p => p.status === 'pending').length, amount: todayPending },
    { name: 'متأخر', value: payments.filter(p => p.status === 'late').length, amount: todayLate },
  ].filter(d => d.value > 0);

  // Payment type distribution
  const typeData = [
    { name: 'اشتراكات', value: payments.filter(p => p.type === 'subscription' && p.status === 'paid').reduce((s, p) => s + p.amount, 0) },
    { name: 'كتب', value: payments.filter(p => p.type === 'books' && p.status === 'paid').reduce((s, p) => s + p.amount, 0) },
    { name: 'أخرى', value: payments.filter(p => p.type === 'other' && p.status === 'paid').reduce((s, p) => s + p.amount, 0) },
  ].filter(d => d.value > 0);

  // Last 7 days trend
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = dayjs(selectedDate).subtract(i, 'day');
    const dateStr = date.format('YYYY-MM-DD');
    const revenue = allPayments
      .filter(p => p.date === dateStr && p.status === 'paid')
      .reduce((s, p) => s + p.amount, 0);
    const expense = allExpenses
      .filter(e => e.date === dateStr)
      .reduce((s, e) => s + e.amount, 0);
    last7Days.push({
      date: date.format('MM/DD'),
      day: date.format('ddd'),
      revenue,
      expense,
      profit: revenue - expense,
    });
  }

  // Get student and course names
  function getStudentName(id: string) {
    return students.find(s => s.id === id)?.name || 'غير معروف';
  }
  function getCourseName(id?: string) {
    if (!id) return '—';
    return courses.find(c => c.id === id)?.name || '—';
  }
  function getPaymentType(type: string) {
    return type === 'subscription' ? 'اشتراك' : type === 'books' ? 'كتب' : 'أخرى';
  }
  function getPaymentStatus(status: string) {
    return status === 'paid' ? 'مدفوع' : status === 'pending' ? 'معلق' : 'متأخر';
  }
  function getStatusColor(status: string) {
    return status === 'paid' ? 'bg-green-100 text-green-700' : status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  }

  // Export functions
  function exportDailyReport() {
    const data = payments.map(p => ({
      student: getStudentName(p.studentId),
      course: getCourseName(p.courseId),
      amount: p.amount,
      type: getPaymentType(p.type),
      status: getPaymentStatus(p.status),
      notes: p.notes || '',
    }));
    const csv = toCSV(data as unknown as Record<string, unknown>[], [
      { key: 'student', label: 'الطالب' },
      { key: 'course', label: 'الكورس' },
      { key: 'amount', label: 'المبلغ' },
      { key: 'type', label: 'النوع' },
      { key: 'status', label: 'الحالة' },
      { key: 'notes', label: 'ملاحظات' },
    ]);
    downloadCSV(csv, `daily_report_${selectedDate}.csv`);
    notify.success('تم تصدير التقرير اليومي');
  }

  function printReport() {
    window.print();
  }

  const isToday = selectedDate === dayjs().format('YYYY-MM-DD');
  const displayDate = dayjs(selectedDate).format('dddd، D MMMM YYYY');

  if (loading) {
    return (
      <Layout title="التقارير اليومية">
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="التقارير اليومية">
      <div className="space-y-6 print-full">
        {/* Date Navigation */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 no-print">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={goToPreviousDay}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
              
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  max={dayjs().format('YYYY-MM-DD')}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <button
                onClick={goToNextDay}
                disabled={isToday}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
              </button>
              
              {!isToday && (
                <button
                  onClick={goToToday}
                  className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium hover:bg-indigo-100 transition-colors"
                >
                  اليوم
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={printReport}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Printer size={16} /> طباعة
              </button>
              <button
                onClick={exportDailyReport}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
              >
                <Download size={16} /> تصدير CSV
              </button>
            </div>
          </div>
          
          <div className="mt-3 text-center">
            <h2 className="text-lg font-bold text-gray-900">{displayDate}</h2>
            {isToday && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">اليوم</span>}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">إجمالي الإيرادات</span>
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign size={16} className="text-green-600" />
              </div>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(todayRevenue, settings?.currency)}</p>
            {revenueChange !== 0 && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${revenueChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {revenueChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span>{Math.abs(revenueChange)}% عن أمس</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">المدفوعات المعلقة</span>
              <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                <CreditCard size={16} className="text-yellow-600" />
              </div>
            </div>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(todayPending, settings?.currency)}</p>
            <p className="text-xs text-gray-400 mt-1">{payments.filter(p => p.status === 'pending').length} دفعة</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">المدفوعات المتأخرة</span>
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <CreditCard size={16} className="text-red-600" />
              </div>
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(todayLate, settings?.currency)}</p>
            <p className="text-xs text-gray-400 mt-1">{payments.filter(p => p.status === 'late').length} دفعة</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">المصروفات</span>
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <Wallet size={16} className="text-orange-600" />
              </div>
            </div>
            <p className="text-xl font-bold text-orange-600">{formatCurrency(todayExpenses, settings?.currency)}</p>
            <p className="text-xs text-gray-400 mt-1">{expenses.length} مصروف</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">صافي الربح</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${todayProfit >= 0 ? 'bg-indigo-100' : 'bg-red-100'}`}>
                {todayProfit >= 0 ? <TrendingUp size={16} className="text-indigo-600" /> : <TrendingDown size={16} className="text-red-600" />}
              </div>
            </div>
            <p className={`text-xl font-bold ${todayProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
              {formatCurrency(todayProfit, settings?.currency)}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">عدد المعاملات</span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Users size={16} className="text-purple-600" />
              </div>
            </div>
            <p className="text-xl font-bold text-purple-600">{totalPaymentsCount}</p>
            <p className="text-xs text-gray-400 mt-1">{paidPaymentsCount} مدفوعة</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 7-Day Trend */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">اتجاه الإيرادات (آخر 7 أيام)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  formatter={(value, name) => [
                    formatCurrency(Number(value), settings?.currency),
                    name === 'revenue' ? 'الإيرادات' : name === 'expense' ? 'المصروفات' : 'الربح'
                  ]}
                  labelFormatter={(label) => `التاريخ: ${label}`}
                />
                <Legend formatter={v => v === 'revenue' ? 'الإيرادات' : v === 'expense' ? 'المصروفات' : 'الربح'} />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} name="revenue" />
                <Line type="monotone" dataKey="expense" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316' }} name="expense" />
                <Line type="monotone" dataKey="profit" stroke={primaryColor} strokeWidth={2} dot={{ fill: primaryColor }} name="profit" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Payment Status Pie */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">توزيع حالة الدفعات</h3>
            {statusData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">لا توجد دفعات</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(_v, _n, props) => [formatCurrency(props.payload.amount, settings?.currency), props.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Types & Expenses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Types */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">الإيرادات حسب النوع</h3>
            {typeData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">لا توجد إيرادات</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={typeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v), settings?.currency), 'المبلغ']} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {typeData.map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Today's Expenses */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">مصروفات اليوم</h3>
            {expenses.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">لا توجد مصروفات</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {expenses.map(exp => (
                  <div key={exp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{exp.description}</p>
                      <p className="text-xs text-gray-500">
                        {exp.category === 'salaries' ? 'رواتب' :
                         exp.category === 'bills' ? 'فواتير' :
                         exp.category === 'maintenance' ? 'صيانة' :
                         exp.category === 'purchases' ? 'مشتريات' :
                         exp.category === 'rent' ? 'إيجار' : 'أخرى'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-red-600">
                      -{formatCurrency(exp.amount, settings?.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900">تفاصيل المدفوعات</h3>
            <p className="text-sm text-gray-500">{formatDate(selectedDate)}</p>
          </div>
          
          {payments.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <DollarSign size={48} className="mx-auto mb-3 opacity-30" />
              <p>لا توجد مدفوعات في هذا اليوم</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">#</th>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">الطالب</th>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">الكورس</th>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">المبلغ</th>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">النوع</th>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">الحالة</th>
                    <th className="p-4 text-right text-xs font-semibold text-gray-600">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {payments.map((payment, idx) => (
                    <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-500">{idx + 1}</td>
                      <td className="p-4 text-sm font-medium text-gray-900">{getStudentName(payment.studentId)}</td>
                      <td className="p-4 text-sm text-gray-600">{getCourseName(payment.courseId)}</td>
                      <td className="p-4 text-sm font-bold text-gray-900">{formatCurrency(payment.amount, settings?.currency)}</td>
                      <td className="p-4">
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                          {getPaymentType(payment.type)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(payment.status)}`}>
                          {getPaymentStatus(payment.status)}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-500">{payment.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={3} className="p-4 text-sm font-bold text-gray-900">الإجمالي</td>
                    <td className="p-4 text-sm font-bold text-green-600">
                      {formatCurrency(todayRevenue, settings?.currency)}
                    </td>
                    <td colSpan={3} className="p-4 text-sm text-gray-500">
                      ({paidPaymentsCount} من {totalPaymentsCount} مدفوعة)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Daily Summary Print Section */}
        <div className="hidden print:block bg-white p-6 rounded-2xl border border-gray-200">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">{settings?.centerName || 'EduCenter Pro'}</h1>
            <h2 className="text-lg text-gray-600">التقرير اليومي للإيرادات</h2>
            <p className="text-gray-500">{displayDate}</p>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">الإيرادات</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(todayRevenue, settings?.currency)}</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-sm text-gray-600">المصروفات</p>
              <p className="text-xl font-bold text-orange-600">{formatCurrency(todayExpenses, settings?.currency)}</p>
            </div>
            <div className="text-center p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">صافي الربح</p>
              <p className={`text-xl font-bold ${todayProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                {formatCurrency(todayProfit, settings?.currency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
