import dayjs from 'dayjs';
import {
  AlertCircle, AlertTriangle,
  BookOpen,
  CalendarX,
  Clock,
  DollarSign,
  GraduationCap,
  MessageCircle,
  RefreshCw,
  TrendingUp,
  Users,
  Users2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
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
import RenewDialog from '../components/RenewDialog';
import { StatCard } from '../components/ui/Card';
import ResourceError from '../components/ui/ResourceError';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { usePageResource } from '../hooks/usePageResource';
import { showBackupReminder } from '../lib/autoBackup';
import { installmentRemaining, RENEWAL_STATE_LABEL } from '../lib/billing';
import { DebtAlert, refreshDebtAlert, subscribeDebtAlert } from '../lib/debtAlerts';
import { requestNotificationPermission, showBrowserNotification } from '../lib/notifications';
import { formatCurrency, formatDate, getArabicDay, getStatusLabel, getWhatsAppLink } from '../lib/utils';
import type { DebtorRow } from '../services/balanceService';
import { getDebtors } from '../services/balanceService';
import { emptyDashboardData, loadDashboardData } from '../services/queries/dashboard';
import type { RenewalCandidate } from '../services/renewalService';
import { runStartupMaintenance } from '../services/startupMaintenance';

export default function DashboardPage() {
  const { settings } = useApp();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const primaryColor = settings?.primaryColor || '#6366f1';
  /** الأرقام المالية لمن عنده صلاحية المدفوعات — المدرس/المشرف يشوفوا الأكاديمي بس */
  const showMoney = can('payments', 'view');
  const canSeeDebtors = can('debtors', 'view');
  const canRenew = can('payments', 'create');
  const [debtAlert, setDebtAlert] = useState<DebtAlert | null>(null);
  const [topDebtors, setTopDebtors] = useState<DebtorRow[]>([]);
  const [renewTarget, setRenewTarget] = useState<RenewalCandidate | null>(null);

  const query = useCallback(() => loadDashboardData({
    role: user?.role, teacherId: user?.teacherId, upcomingDueDays: settings?.upcomingDueDays,
  }), [user?.role, user?.teacherId, settings?.upcomingDueDays]);
  const { data: { todayKey: TODAY_KEY, stats, revenueData, genderData, todayGroups, recentStudents, upcoming, conflicts, renewals, absenceAlerts, todayAttendance }, loading, reload: loadDashboard, error } = usePageResource(query, emptyDashboardData());

  // تنبيهات المديونيات + إشعار المتأخرات (مرة واحدة في اليوم)
  useEffect(() => {
    if (!canSeeDebtors) return;
    let active = true;
    const unsubscribe = subscribeDebtAlert(setDebtAlert);
    void (async () => {
      const alert = await refreshDebtAlert();
      if (!active || alert.unavailable) return;
      if (alert.debtorsCount > 0) {
        try {
          const debtors = await getDebtors();
          if (active) setTopDebtors(debtors.slice(0, 5));
        } catch (e) {
          console.error('top debtors error:', e);
        }
      } else {
        setTopDebtors([]);
      }

      if (!active) return;
      const key = `debt_alert_notified_${dayjs().format('YYYY-MM-DD')}`;
      if (alert.overdueCount > 0 && settings?.notifyLatePayment !== false && !localStorage.getItem(key)) {
        localStorage.setItem(key, 'true');
        showBrowserNotification(
          'متأخرات 💰',
          `${alert.debtorsCount} طالب عليهم متأخرات بقيمة ${alert.overdueAmount}`
        );
      }
    })();
    return () => { active = false; unsubscribe(); };
  }, [canSeeDebtors, settings?.notifyLatePayment]);

  useEffect(() => {
    requestNotificationPermission();
    showBackupReminder();
  }, []);

  useEffect(() => {
    let active = true;
    void runStartupMaintenance()
      .then(() => { if (active) void loadDashboard(); })
      .catch(error => console.error('Migration failed', error));
    return () => { active = false; };
  }, [loadDashboard]);

  if (error) return <PageReadError title="لوحة التحكم" onRetry={loadDashboard} />;

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
          {showMoney && (
            <StatCard
              title="إجمالي الإيرادات"
              value={formatCurrency(stats.totalRevenue, settings?.currency)}
              icon={<DollarSign size={24} />}
              color="#22c55e"
              subtitle="مجموع المدفوعات"
            />
          )}
          {showMoney && (
            <StatCard
              title="المدفوعات المعلقة"
              value={stats.pendingPayments}
              icon={<AlertCircle size={24} />}
              color="#f97316"
              subtitle={formatCurrency(stats.pendingAmount, settings?.currency)}
            />
          )}
          {canSeeDebtors && (
            <StatCard
              title="طلاب عليهم مبالغ"
              value={debtAlert && !debtAlert.loading && !debtAlert.unavailable ? debtAlert.debtorsCount : '—'}
              icon={<AlertTriangle size={24} />}
              color="#ef4444"
              subtitle={
                !debtAlert || debtAlert.loading ? 'جاري تحديث أرصدة الطلاب' : debtAlert.unavailable ? 'تعذّر تأكيد أرصدة الطلاب' : debtAlert.debtorsCount > 0
                  ? `${formatCurrency(debtAlert.totalRemaining, settings?.currency)}${debtAlert.overdueCount > 0 ? ` • فيها متأخرات` : ''}`
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
          {showMoney && (
            <StatCard
              title="معدل النمو (إيرادات)"
              value={`${stats.growthRate >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(stats.growthRate))}%`}
              icon={<TrendingUp size={24} />}
              color={stats.growthRate >= 0 ? "#06b6d4" : "#ef4444"}
              subtitle="مقارنة بالشهر الماضي"
            />
          )}
        </div>

        {canSeeDebtors && debtAlert?.unavailable && <ResourceError onRetry={() => refreshDebtAlert(true)} message="تعذّر تحديث تنبيه المديونيات. الأرصدة السابقة ليست تأكيداً للحسابات الحالية." />}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          {showMoney && (
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
          )}

          {/* Gender Pie */}
          <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${showMoney ? '' : 'lg:col-span-3'}`}>
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

        {/* استحقاقات قريبة — التنبيه قبل ما القسط يتأخر */}
        {showMoney && upcoming && upcoming.count > 0 && (
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Clock size={18} className="text-amber-500" /> مطلوب دفعه خلال {settings?.upcomingDueDays ?? 3} يوم
              </h3>
              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {upcoming.count} طالب • {formatCurrency(upcoming.amount, settings?.currency)}
              </span>
              <button onClick={() => navigate('/payments')}
                className="mr-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                تحصيل ←
              </button>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {upcoming.items.slice(0, 6).map(i => {
                const st = recentStudents.find(x => x.id === i.studentId);
                return (
                  <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/40 border border-amber-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{st?.name || 'طالب'}</p>
                      <p className="text-xs text-gray-500">
                        يستحق {formatDate(i.dueDate)}
                        <span className={i.daysUntilDue <= 1 ? 'text-red-600 font-bold' : 'text-amber-600'}>
                          {' '}• {i.daysUntilDue === 0 ? 'النهاردة' : `بعد ${i.daysUntilDue} يوم`}
                        </span>
                      </p>
                    </div>
                    <p className="text-sm font-bold text-amber-700 flex-shrink-0">
                      {formatCurrency(installmentRemaining(i), settings?.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ملخص حضور النهاردة */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Users2 size={18} className="text-indigo-500" /> حضور اليوم
            </h3>
            <span className="text-xs text-gray-400">{todayAttendance.recordedGroups} مجموعة مسجّلة</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'حاضر', value: todayAttendance.present, cls: 'bg-green-50 text-green-700' },
              { label: 'غائب', value: todayAttendance.absent, cls: 'bg-red-50 text-red-700' },
              { label: 'متأخر', value: todayAttendance.late, cls: 'bg-yellow-50 text-yellow-700' },
              { label: 'مستأذن', value: todayAttendance.excused, cls: 'bg-blue-50 text-blue-700' },
            ].map(it => (
              <div key={it.label} className={`rounded-xl p-3 text-center ${it.cls}`}>
                <p className="text-2xl font-bold">{it.value}</p>
                <p className="text-xs font-medium mt-0.5">{it.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* تنبيهات الغياب المتكرر (3+ متتالية) — مؤشر انسحاب */}
        {absenceAlerts.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" /> غياب متكرر — تواصل مع ولي الأمر
              </h3>
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                {absenceAlerts.length}
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {absenceAlerts.slice(0, 6).map(a => (
                <div key={`${a.studentId}-${a.groupId}`} className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.studentName}</p>
                    <p className="text-xs text-gray-500">{a.groupName} · آخر غياب {formatDate(a.lastDate)}</p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-bold whitespace-nowrap">
                    {a.streak} غياب متتالي
                  </span>
                  {a.parentPhone && (
                    <a
                      href={getWhatsAppLink(a.parentPhone, `السلام عليكم، نود إعلامكم بأن الطالب/ة ${a.studentName} غاب ${a.streak} مرات متتالية عن مجموعة ${a.groupName}. برجاء التواصل لتأكيد استمرارية الطالب.`)}
                      target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                      title="مراسلة ولي الأمر عبر واتساب"
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}
                  <button
                    onClick={() => navigate(`/students/${a.studentId}`)}
                    className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
                  >
                    الملف
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* تعارضات الجدول */}
        {conflicts.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <CalendarX size={18} className="text-red-500" /> تعارضات في الجدول
              </h3>
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                {conflicts.length} تعارض
              </span>
              <button onClick={() => navigate('/groups')}
                className="mr-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                المجموعات ←
              </button>
            </div>
            <div className="p-3 space-y-2">
              {conflicts.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{c.message}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c.dayLabel} · {c.time} · {c.groupNames.join(' + ')}
                    </p>
                  </div>
                </div>
              ))}
              {conflicts.length > 5 && (
                <p className="text-xs text-gray-400 text-center pt-1">و{conflicts.length - 5} تعارضات أخرى — راجع مواعيد المجموعات</p>
              )}
            </div>
          </div>
        )}

        {/* اشتراكات محتاجة تجديد */}
        {renewals.length > 0 && (
          <div className="bg-white rounded-2xl border border-yellow-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <RefreshCw size={18} className="text-yellow-500" /> طلاب محتاجين تجديد
              </h3>
              <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                {renewals.filter(r => r.info.state === 'expired').length} خلص • {renewals.filter(r => r.info.state === 'expiring').length} بيخلص
              </span>
            </div>
            <div className="p-3 space-y-2">
              {renewals.slice(0, 8).map(r => (
                <div key={`${r.studentId}-${r.groupId}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-yellow-50/60 transition-colors">
                  <button onClick={() => navigate(`/students/${r.studentId}`)} className="flex-1 min-w-0 text-right">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.studentName}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {r.groupName} • {r.courseName} • {r.teacherName}
                      {showMoney && r.remaining > 0 && <span className="text-red-500"> • باقي عليه {formatCurrency(r.remaining, settings?.currency)}</span>}
                    </p>
                  </button>
                  <div className="text-left flex-shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.info.state === 'expired' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'}`}>
                      {RENEWAL_STATE_LABEL[r.info.state]}
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {r.info.endDate ? formatDate(r.info.endDate) : ''}
                      {typeof r.info.daysLeft === 'number' && (r.info.daysLeft > 0 ? ` · باقي ${r.info.daysLeft} يوم` : ` · من ${Math.abs(r.info.daysLeft)} يوم`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {r.parentPhone && (
                      <a href={getWhatsAppLink(r.parentPhone, `السلام عليكم، معكم ${settings?.centerName || 'المركز'}.\nشهر ${r.studentName} في ${r.groupName} ${r.info.state === 'expired' ? 'خلص' : 'بيخلص'}${r.info.endDate ? ` (${formatDate(r.info.endDate)})` : ''}. يسعدنا استمراركم معنا — برجاء التواصل لتجديد الشهر.`)}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title={`واتساب ولي الأمر ${r.parentPhone}`}>
                        <MessageCircle size={15} />
                      </a>
                    )}
                    {canRenew && (
                      <button onClick={() => setRenewTarget(r)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                        تجديد
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {renewals.length > 8 && (
                <p className="text-xs text-gray-400 text-center pt-1">و{renewals.length - 8} طالب آخر — افتح ملف الطالب</p>
              )}
            </div>
          </div>
        )}

        {/* تنبيهات المديونيات */}
        {canSeeDebtors && topDebtors.length > 0 && (
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
                      {d.overdueCount > 0 && <span className="text-red-500"> • متأخر</span>}
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

      {renewTarget && (
        <RenewDialog
          open={!!renewTarget}
          studentId={renewTarget.studentId}
          studentName={renewTarget.studentName}
          groupId={renewTarget.groupId}
          onClose={() => setRenewTarget(null)}
          onDone={() => loadDashboard()}
        />
      )}
    </Layout>
  );
}
