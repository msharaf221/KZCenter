import { AlertCircle, CalendarX } from 'lucide-react';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardConflictsCardProps {
  conflicts: DashboardData['conflicts'];
  onNavigateToGroups: () => void;
}

export default function DashboardConflictsCard({
  conflicts,
  onNavigateToGroups,
}: DashboardConflictsCardProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <CalendarX size={18} className="text-red-500" /> تعارضات في الجدول
        </h3>
        <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
          {conflicts.length} تعارض
        </span>
        <button
          onClick={onNavigateToGroups}
          className="mr-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
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
          <p className="text-xs text-gray-400 text-center pt-1">
            و{conflicts.length - 5} تعارضات أخرى — راجع مواعيد المجموعات
          </p>
        )}
      </div>
    </div>
  );
}
