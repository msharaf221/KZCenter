import { AlertTriangle } from 'lucide-react';
import type { DebtAlert } from '../../lib/debtAlerts';
import { formatCurrency } from '../../lib/utils';
import type { DebtorRow } from '../../services/balanceService';

interface DashboardDebtorsCardProps {
  canSeeDebtors: boolean;
  topDebtors: DebtorRow[];
  debtAlert: DebtAlert | null;
  currency?: string;
  onNavigateToDebtors: () => void;
  onNavigateToStudent: (studentId: string) => void;
}

export default function DashboardDebtorsCard({
  canSeeDebtors,
  topDebtors,
  debtAlert,
  currency,
  onNavigateToDebtors,
  onNavigateToStudent,
}: DashboardDebtorsCardProps) {
  if (!canSeeDebtors || topDebtors.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" /> أعلى المديونيات
        </h3>
        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
          {debtAlert?.debtorsCount} طالب • {formatCurrency(debtAlert?.totalRemaining || 0, currency)}
        </span>
        <button
          onClick={onNavigateToDebtors}
          className="mr-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          عرض كل المديونيات ←
        </button>
      </div>
      <div className="p-3 space-y-2">
        {topDebtors.map((d) => (
          <button
            key={d.studentId}
            onClick={() => onNavigateToStudent(d.studentId)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50/60 transition-colors text-right"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {d.groups.map((g) => g.groupName).join('، ') || '—'}
                {d.overdueCount > 0 && <span className="text-red-500"> • متأخر</span>}
              </p>
            </div>
            <div className="text-left flex-shrink-0">
              <p className="text-sm font-bold text-red-600">{formatCurrency(d.remaining, currency)}</p>
              <p className="text-xs text-gray-400">
                {d.lastPaymentDate ? `آخر دفعة من ${d.daysSinceLastPayment} يوم` : 'لم يدفع بعد'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
