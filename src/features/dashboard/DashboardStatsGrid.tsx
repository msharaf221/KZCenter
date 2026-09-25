import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Clock,
  DollarSign,
  GraduationCap,
  TrendingUp,
  Users,
  Users2,
} from 'lucide-react';
import { StatCard } from '../../components/ui/Card';
import type { DebtAlert } from '../../lib/debtAlerts';
import { formatCurrency, getArabicDay } from '../../lib/utils';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardStatsGridProps {
  stats: DashboardData['stats'];
  todayGroupsCount: number;
  todayKey: string;
  showMoney: boolean;
  canSeeDebtors: boolean;
  debtAlert: DebtAlert | null;
  currency?: string;
  onNavigateToDebtors: () => void;
}

export default function DashboardStatsGrid({
  stats,
  todayGroupsCount,
  todayKey,
  showMoney,
  canSeeDebtors,
  debtAlert,
  currency,
  onNavigateToDebtors,
}: DashboardStatsGridProps) {
  return (
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
          value={formatCurrency(stats.totalRevenue, currency)}
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
          subtitle={formatCurrency(stats.pendingAmount, currency)}
        />
      )}
      {canSeeDebtors && (
        <StatCard
          title="طلاب عليهم مبالغ"
          value={debtAlert && !debtAlert.loading && !debtAlert.unavailable ? debtAlert.debtorsCount : '—'}
          icon={<AlertTriangle size={24} />}
          color="#ef4444"
          subtitle={
            !debtAlert || debtAlert.loading
              ? 'جاري تحديث أرصدة الطلاب'
              : debtAlert.unavailable
                ? 'تعذّر تأكيد أرصدة الطلاب'
                : debtAlert.debtorsCount > 0
                  ? `${formatCurrency(debtAlert.totalRemaining, currency)}${debtAlert.overdueCount > 0 ? ` • فيها متأخرات` : ''}`
                  : 'كل الطلاب مسددين'
          }
          onClick={onNavigateToDebtors}
        />
      )}
      <StatCard
        title="حصص اليوم"
        value={todayGroupsCount}
        icon={<Clock size={24} />}
        color="#3b82f6"
        subtitle={getArabicDay(todayKey)}
      />
      {showMoney && (
        <StatCard
          title="معدل النمو (إيرادات)"
          value={`${stats.growthRate >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(stats.growthRate))}%`}
          icon={<TrendingUp size={24} />}
          color={stats.growthRate >= 0 ? '#06b6d4' : '#ef4444'}
          subtitle="مقارنة بالشهر الماضي"
        />
      )}
    </div>
  );
}
