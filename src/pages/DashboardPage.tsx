import { useState, useEffect } from 'react';
import {
  GraduationCap, Users, BookOpen, Users2,
  DollarSign, Clock, TrendingUp, AlertCircle, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import Layout from '../components/layout/Layout';
import { StatCard } from '../components/ui/Card';
import { dbGetAll, recalculateStudentTotalPaid, migrateInstallments, markOverdueInstallments, getDebtors, Student, Teacher, Group, Course, Payment, DebtorRow } from '../lib/db';
import { formatDate, formatCurrency, getStatusLabel, getArabicDay } from '../lib/utils';
import { requestNotificationPermission, showBrowserNotification } from '../lib/notifications';
import { subscribeDebtAlert, refreshDebtAlert, DebtAlert } from '../lib/debtAlerts';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { showBackupReminder } from '../lib/autoBackup';
import dayjs from 'dayjs';

const TODAY_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

export default function DashboardPage() {
  const { settings } = useApp();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [stats, setStats] = useState({
    activeStudents: 0,
    teachers: 0,
    courses: 0,
    groups: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    pendingAmount: 0,
    growthRate: 0,
  });
  const [revenueData, setRevenueData] = useState<{ month: string; revenue: number }[]>([]);
  const [genderData, setGenderData] = useState<{ name: string; value: number }[]>([]);
  const [todayGroups, setTodayGroups] = useState<(Group & { courseName: string; teacherName: string })[]>([]);
  const [recentStudents, setRecentStudents] = useState<Student[]>([]);
  const [debtAlert, setDebtAlert] = useState<DebtAlert | null>(null);
  const [topDebtors, setTopDebtors] = useState<DebtorRow[]>([]);
  const [loading, setLoading] = useState(true);

  // تنبيهات المديونيات + إشعار المتأخرات (مرة واحدة في اليوم)
  useEffect(() => {
    if (!isAdmin()) return;
    const unsubscribe = subscribeDebtAlert(setDebtAlert);
    void (async () => {
      const alert = await refreshDebtAlert();
      if (alert.debtorsCount > 0) {
        try {
          setTopDebtors((await getDebtors()).slice(0, 5));
        } catch (e) {
          console.error('top debtors error:', e);
        }
      } else {
        setTopDebtors([]);
      }

      const key = `debt_alert_notified_${dayjs().format('YYYY-MM-DD')}`;
      if (alert.overdueCount > 0 && settings?.notifyLatePayment !== false && !localStorage.getItem(key)) {
        localStorage.setItem(key, 'true');
        showBrowserNotification(
          'أقساط متأخرة 💰',
          `${alert.overdueCount} قسط متأخر على ${alert.debtorsCount} طالب بقيمة ${alert.overdueAmount}`
        );
      }
    })();
    return unsubscribe;
  }, [isAdmin, settings?.notifyLatePayment]);

  useEffect(() => {
    requestNotificationPermission();
    showBackupReminder();
  }, []);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [students, teachers, courses, groups, payments] = await Promise.all([
        dbGetAll<Student>('students'),
        dbGetAll<Teacher>('teachers'),
        dbGetAll<Course>('courses'),
        dbGetAll<Group>('groups'),
        dbGetAll<Payment>('payments'),
      ]);

      // Stats
      const activeStudents = students.filter(s => s.status === 'active').length;
      const totalRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
      const pendingPayments = payments.filter(p => p.status === 'pending' || p.status === 'late').length;
      const pendingAmount = payments.filter(p => p.status === 'pending' || p.status === 'late').reduce((s, p) => s + p.amount, 0);

      // Revenue last 6 months
      const monthlyRevenue: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const m = dayjs().subtract(i, 'month');
        monthlyRevenue[m.format('YYYY-MM')] = 0;
      }
      payments.filter(p => p.status === 'paid').forEach(p => {
        const key = p.date.substring(0, 7);
        if (key in monthlyRevenue) {
          monthlyRevenue[key] = (monthlyRevenue[key] || 0) + p.amount;
        }
      });

      const thisMonthKey = dayjs().format('YYYY-MM');
      const lastMonthKey = dayjs().subtract(1, 'month').format('YYYY-MM');
      const thisMonthRev = monthlyRevenue[thisMonthKey] || 0;
      const lastMonthRev = monthlyRevenue[lastMonthKey] || 0;
      
      let growthRate = 0;
      if (lastMonthRev > 0) {
        growthRate = ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100;
      } else if (thisMonthRev > 0) {
        growthRate = 100;
      }

      setStats({
        activeStudents,
        teachers: teachers.filter(t => t.status === 'active').length,
        courses: courses.length,
        groups: groups.filter(g => g.status === 'open').length,
        totalRevenue,
        pendingPayments,
        pendingAmount,
        growthRate,
      });

      setRevenueData(
        Object.entries(monthlyRevenue).map(([key, revenue]) => ({
          month: dayjs(key).format('MMM YYYY'),
          revenue,
        }))
      );

      // Gender distribution
      const males = students.filter(s => s.gender === 'male').length;
      const females = students.filter(s => s.gender === 'female').length;
      setGenderData([
        { name: 'أولاد', value: males },
        { name: 'بنات', value: females },
      ]);

      // Today's groups
      const todayG = groups
        .filter(g => g.schedule.some(s => s.days.includes(TODAY_KEY)))
        .map(g => ({
          ...g,
          courseName: courses.find(c => c.id === g.courseId)?.name || 'غير محدد',
          teacherName: teachers.find(t => t.id === g.teacherId)?.name || 'غير محدد',
        }));
      setTodayGroups(todayG.slice(0, 8));

      // Recent students
      const sorted = [...students]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      setRecentStudents(sorted);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const runMigration = async () => {
      try {
        // 1) توليد الأقساط للتسجيلات القديمة (مرة واحدة فقط)
        if (!localStorage.getItem('migration_installments_v1')) {
          await migrateInstallments();
          localStorage.setItem('migration_installments_v1', 'true');
        }

        // 2) تحديث حالة الأقساط المتأخرة (مع كل فتح للتطبيق)
        await markOverdueInstallments();

        // 3) Migration: Recalculate balances for all students (runs once, non-blocking)
        if (!localStorage.getItem('migration_balances_v1')) {
          const students = await dbGetAll<Student>('students');
          // Run sequentially in batches to avoid freezing the UI
          for (let i = 0; i < students.length; i++) {
            await recalculateStudentTotalPaid(students[i].id);
            // Yield to the event loop every 10 records
            if (i % 10 === 9) {
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
          localStorage.setItem('migration_balances_v1', 'true');
        }

        loadDashboard();
      } catch (e) {
        console.error('Migration failed', e);
      }
    };
    runMigration();
  }, []);

  if (loading) {
    return (
      <Layout title="لوحة التحكم">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="لوحة التحكم">
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="الطلاب النشطون"
            value={stats.activeStudents}
            icon={<GraduationCap size={24} />}
            color="#6366f1"
            subtitle="طالب مسجل"
          />
          <StatCard
            title="المدرسون النشطون"
            value={stats.teachers}
            icon={<Users size={24} />}
            color="#8b5cf6"
            subtitle="مدرس"
          />
          <StatCard
            title="الكورسات"
            value={stats.courses}
            icon={<BookOpen size={24} />}
            color="#ec4899"
            subtitle="كورس متاح"
          />
          <StatCard
            title="المجموعات المفتوحة"
            value={stats.groups}
            icon={<Users2 size={24} />}
            color="#14b8a6"
            subtitle="مجموعة"
          />
          <StatCard
            title="إجمالي الإيرادات"
            value={formatCurrency(stats.totalRevenue, settings?.currency)}
            icon={<DollarSign size={24} />}
            color="#22c55e"
            subtitle="مجموع المدفوعات"
          />
          <StatCard
            title="المدفوعات المعلقة"
            value={stats.pendingPayments}
            icon={<AlertCircle size={24} />}
            color="#f97316"
            subtitle={formatCurrency(stats.pendingAmount, settings?.currency)}
          />
          {isAdmin() && (
            <StatCard
              title="طلاب عليهم مبالغ"
              value={debtAlert?.debtorsCount ?? 0}
              icon={<AlertTriangle size={24} />}
              color="#ef4444"
              subtitle={
                debtAlert && debtAlert.debtorsCount > 0
                  ? `${formatCurrency(debtAlert.totalRemaining, settings?.currency)}${debtAlert.overdueCount > 0 ? ` • ${debtAlert.overdueCount} قسط متأخر` : ''}`
                  : 'كل الطلاب مسددين'
              }
              onClick={() => navigate('/debtors')}
            />
          )}
          <StatCard
            title="حصص اليوم"
            value={todayGroups.length}
            icon={<Clock size={24} />}
            color="#3b82f6"
            subtitle={getArabicDay(TODAY_KEY)}
          />
          <StatCard
            title="معدل النمو (إيرادات)"
            value={`${stats.growthRate >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(stats.growthRate))}%`}
            icon={<TrendingUp size={24} />}
            color={stats.growthRate >= 0 ? "#06b6d4" : "#ef4444"}
            subtitle="مقارنة بالشهر الماضي"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">الإيرادات الشهرية</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={primaryColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [formatCurrency(Number(v), settings?.currency), 'الإيرادات']} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={primaryColor}
                  fill="url(#revenue)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Gender Pie */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-base font-bold text-gray-900 mb-4">أولاد و بنات</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  <Cell fill="#6366f1" />
                  <Cell fill="#ec4899" />
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* تنبيهات المديونيات */}
        {isAdmin() && topDebtors.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" /> أعلى المديونيات
              </h3>
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                {debtAlert?.debtorsCount} طالب • {formatCurrency(debtAlert?.totalRemaining || 0, settings?.currency)}
              </span>
              <button onClick={() => navigate('/debtors')}
                className="mr-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                عرض كل المديونيات ←
              </button>
            </div>
            <div className="p-3 space-y-2">
              {topDebtors.map(d => (
                <button key={d.studentId} onClick={() => navigate(`/students/${d.studentId}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50/60 transition-colors text-right">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {d.groups.map(g => g.groupName).join('، ') || '—'}
                      {d.overdueCount > 0 && <span className="text-red-500"> • {d.overdueCount} قسط متأخر</span>}
                    </p>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="text-sm font-bold text-red-600">{formatCurrency(d.remaining, settings?.currency)}</p>
                    <p className="text-xs text-gray-400">
                      {d.lastPaymentDate ? `آخر دفعة من ${d.daysSinceLastPayment} يوم` : 'لم يدفع بعد'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Today's Schedule & Recent Students */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Groups */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                حصص اليوم - {getArabicDay(TODAY_KEY)}
              </h3>
            </div>
            <div className="p-3">
              {todayGroups.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">لا توجد حصص اليوم</p>
              ) : (
                <div className="space-y-2">
                  {todayGroups.map(group => (
                    <div key={group.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{group.name}</p>
                        <p className="text-xs text-gray-500">{group.courseName} • {group.teacherName}</p>
                      </div>
                      <div className="text-left">
                        {group.schedule.filter(s => s.days.includes(TODAY_KEY)).map((s, i) => (
                          <p key={i} className="text-xs font-medium text-indigo-600">
                            {s.startTime} - {s.endTime}
                          </p>
                        ))}
                        <p className="text-xs text-gray-400">{group.studentIds.length} طالب</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Students */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">آخر الطلاب المسجلين</h3>
            </div>
            <div className="p-3">
              {recentStudents.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">لا يوجد طلاب حتى الآن</p>
              ) : (
                <div className="space-y-2">
                  {recentStudents.map(student => (
                    <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-lg">
                        {student.gender === 'male' ? '👦' : '👧'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                        <p className="text-xs text-gray-500">{student.parentPhone}</p>
                      </div>
                      <div className="text-left">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${student.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {getStatusLabel(student.status)}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(student.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
