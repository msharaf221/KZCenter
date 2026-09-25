import { AlertTriangle, MessageCircle } from 'lucide-react';
import { formatDate, getWhatsAppLink } from '../../lib/utils';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardAbsenceAlertsCardProps {
  absenceAlerts: DashboardData['absenceAlerts'];
  onNavigateToStudent: (studentId: string) => void;
}

export default function DashboardAbsenceAlertsCard({
  absenceAlerts,
  onNavigateToStudent,
}: DashboardAbsenceAlertsCardProps) {
  if (absenceAlerts.length === 0) return null;

  return (
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
        {absenceAlerts.slice(0, 6).map((a) => (
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
                href={getWhatsAppLink(
                  a.parentPhone,
                  `السلام عليكم، نود إعلامكم بأن الطالب/ة ${a.studentName} غاب ${a.streak} مرات متتالية عن مجموعة ${a.groupName}. برجاء التواصل لتأكيد استمرارية الطالب.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                title="مراسلة ولي الأمر عبر واتساب"
              >
                <MessageCircle size={16} />
              </a>
            )}
            <button
              onClick={() => onNavigateToStudent(a.studentId)}
              className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
            >
              الملف
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
