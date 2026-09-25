import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import RenewDialog from '../components/RenewDialog';
import ResourceError from '../components/ui/ResourceError';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import DashboardAbsenceAlertsCard from '../features/dashboard/DashboardAbsenceAlertsCard';
import DashboardAttendanceCard from '../features/dashboard/DashboardAttendanceCard';
import DashboardCharts from '../features/dashboard/DashboardCharts';
import DashboardConflictsCard from '../features/dashboard/DashboardConflictsCard';
import DashboardDebtorsCard from '../features/dashboard/DashboardDebtorsCard';
import DashboardRenewalsCard from '../features/dashboard/DashboardRenewalsCard';
import DashboardStatsGrid from '../features/dashboard/DashboardStatsGrid';
import DashboardTodayScheduleCard from '../features/dashboard/DashboardTodayScheduleCard';
import DashboardUpcomingCard from '../features/dashboard/DashboardUpcomingCard';
import { usePageResource } from '../hooks/usePageResource';
import { showBackupReminder } from '../lib/autoBackup';
import { type DebtAlert, refreshDebtAlert, subscribeDebtAlert } from '../lib/debtAlerts';
import { requestNotificationPermission, showBrowserNotification } from '../lib/notifications';
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
    role: user?.role,
    teacherId: user?.teacherId,
    upcomingDueDays: settings?.upcomingDueDays,
  }), [user?.role, user?.teacherId, settings?.upcomingDueDays]);

  const {
    data: {
      todayKey: TODAY_KEY,
      stats,
      revenueData,
      genderData,
      todayGroups,
      recentStudents,
      upcoming,
      conflicts,
      renewals,
      absenceAlerts,
      todayAttendance,
    },
    loading,
    reload: loadDashboard,
    error,
  } = usePageResource(query, emptyDashboardData());

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
        <DashboardStatsGrid
          stats={stats}
          todayGroupsCount={todayGroups.length}
          todayKey={TODAY_KEY}
          showMoney={showMoney}
          canSeeDebtors={canSeeDebtors}
          debtAlert={debtAlert}
          currency={settings?.currency}
          onNavigateToDebtors={() => navigate('/debtors')}
        />

        {canSeeDebtors && debtAlert?.unavailable && (
          <ResourceError
            onRetry={() => refreshDebtAlert(true)}
            message="تعذّر تحديث تنبيه المديونيات. الأرصدة السابقة ليست تأكيداً للحسابات الحالية."
          />
        )}

        {/* Charts Row */}
        <DashboardCharts
          showMoney={showMoney}
          revenueData={revenueData}
          genderData={genderData}
          primaryColor={primaryColor}
          currency={settings?.currency}
        />

        {/* Upcoming Due Installments */}
        {showMoney && (
          <DashboardUpcomingCard
            upcoming={upcoming}
            recentStudents={recentStudents}
            upcomingDueDays={settings?.upcomingDueDays}
            currency={settings?.currency}
            onNavigateToPayments={() => navigate('/payments')}
          />
        )}

        {/* Today Attendance Summary */}
        <DashboardAttendanceCard todayAttendance={todayAttendance} />

        {/* Absence Alerts */}
        <DashboardAbsenceAlertsCard
          absenceAlerts={absenceAlerts}
          onNavigateToStudent={(studentId) => navigate(`/students/${studentId}`)}
        />

        {/* Schedule Conflicts */}
        <DashboardConflictsCard
          conflicts={conflicts}
          onNavigateToGroups={() => navigate('/groups')}
        />

        {/* Membership Renewals */}
        <DashboardRenewalsCard
          renewals={renewals}
          showMoney={showMoney}
          canRenew={canRenew}
          centerName={settings?.centerName}
          currency={settings?.currency}
          onNavigateToStudent={(studentId) => navigate(`/students/${studentId}`)}
          onSelectRenew={setRenewTarget}
        />

        {/* Top Debtors */}
        <DashboardDebtorsCard
          canSeeDebtors={canSeeDebtors}
          topDebtors={topDebtors}
          debtAlert={debtAlert}
          currency={settings?.currency}
          onNavigateToDebtors={() => navigate('/debtors')}
          onNavigateToStudent={(studentId) => navigate(`/students/${studentId}`)}
        />

        {/* Today's Schedule & Recent Students */}
        <DashboardTodayScheduleCard
          todayGroups={todayGroups}
          recentStudents={recentStudents}
          todayKey={TODAY_KEY}
        />
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
