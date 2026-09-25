import { Clock } from 'lucide-react';
import { installmentRemaining } from '../../lib/billing';
import { formatCurrency, formatDate } from '../../lib/utils';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardUpcomingCardProps {
  upcoming: DashboardData['upcoming'];
  recentStudents: DashboardData['recentStudents'];
  upcomingDueDays?: number;
  currency?: string;
  onNavigateToPayments: () => void;
}

export default function DashboardUpcomingCard({
  upcoming,
  recentStudents,
  upcomingDueDays = 3,
  currency,
  onNavigateToPayments,
}: DashboardUpcomingCardProps) {
  if (!upcoming || upcoming.count <= 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Clock size={18} className="text-amber-500" /> مطلوب دفعه خلال {upcomingDueDays} يوم
        </h3>
        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
          {upcoming.count} طالب • {formatCurrency(upcoming.amount, currency)}
        </span>
        <button
          onClick={onNavigateToPayments}
          className="mr-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          تحصيل ←
        </button>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {upcoming.items.slice(0, 6).map((item) => {
          const st = recentStudents.find((x) => x.id === item.studentId);
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/40 border border-amber-100"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{st?.name || 'طالب'}</p>
                <p className="text-xs text-gray-500">
                  يستحق {formatDate(item.dueDate)}
                  <span className={item.daysUntilDue <= 1 ? 'text-red-600 font-bold' : 'text-amber-600'}>
                    {' '}• {item.daysUntilDue === 0 ? 'النهاردة' : `بعد ${item.daysUntilDue} يوم`}
                  </span>
                </p>
              </div>
              <p className="text-sm font-bold text-amber-700 flex-shrink-0">
                {formatCurrency(installmentRemaining(item), currency)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
