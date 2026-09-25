import dayjs from 'dayjs';
import { AlertTriangle, Calendar, Clock, Download, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell, Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis,
} from 'recharts';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import { useApp } from '../contexts/AppContext';
import { reportCharts } from '../domain/reporting/charts';
import { dateRange, financialSummary } from '../domain/reporting/finance';
import { usePageResource } from '../hooks/usePageResource';
import { AGING_RANGES, debtAging, installmentRemaining, upcomingDues } from '../lib/billing';
import { notify } from '../lib/notifications';
import { downloadCSV, formatCurrency, formatDate, toCSV } from '../lib/utils';
import { loadReportData } from '../services/queries/reports';

const GENDER_COLORS = ['#6366f1', '#ec4899'];
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4'];

export default function ReportsPage() {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  // فترة التقرير — كان ثابت على «آخر 6 أشهر» من غير اختيار
  const [from, setFrom] = useState(dayjs().subtract(6, 'month').startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));

  const { data, loading, error, reload } = usePageResource(loadReportData, {
    students: [], teachers: [], courses: [], groups: [], payments: [], expenses: [], refunds: [], installments: [],
  });

  const { students, installments } = data;
  const today = dayjs().format('YYYY-MM-DD');
  const { genderData, statusData, ageGroups, courseData, groupFillData, monthlyData, teacherData, expensePieData } = useMemo(() => reportCharts(data, today), [data, today]);
  const { grossRevenue: totalRevenue, refunds: totalRefunds, expenses: totalExpenses, profit: netProfit, byMethod, paymentCount, refundCount, expenseCount } = useMemo(
    () => financialSummary(data, dateRange(from, to), 'signed'), [data, from, to],
  );

  // ===== أعمار الديون =====
  const debtBuckets = debtAging(installments);

  // ===== استحقاقات قريبة =====
  const upcoming = upcomingDues(installments, settings?.upcomingDueDays ?? 3);

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

  if (error) return <PageReadError title="التقارير والإحصائيات" onRetry={reload} />;

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
            <p className="text-[11px] text-gray-400 mt-1">{paymentCount} دفعة</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">المسترد</p>
            <p className="text-2xl font-bold text-orange-500">{formatCurrency(totalRefunds, settings?.currency)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{refundCount} عملية</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">إجمالي المصروفات</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalExpenses, settings?.currency)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{expenseCount} بند</p>
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
                  <p className="text-[11px] text-gray-500">{b?.count || 0} شهر</p>
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
              {upcoming.count} شهر بإجمالي {formatCurrency(upcoming.amount, settings?.currency)} مطلوب دفعهم خلال {settings?.upcomingDueDays ?? 3} يوم
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
