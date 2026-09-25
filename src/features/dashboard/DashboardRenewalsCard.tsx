import { MessageCircle, RefreshCw } from 'lucide-react';
import { RENEWAL_STATE_LABEL } from '../../lib/billing';
import { formatCurrency, formatDate, getWhatsAppLink } from '../../lib/utils';
import type { DashboardData } from '../../services/queries/dashboard';
import type { RenewalCandidate } from '../../services/renewalService';

interface DashboardRenewalsCardProps {
  renewals: DashboardData['renewals'];
  showMoney: boolean;
  canRenew: boolean;
  centerName?: string;
  currency?: string;
  onNavigateToStudent: (studentId: string) => void;
  onSelectRenew: (candidate: RenewalCandidate) => void;
}

export default function DashboardRenewalsCard({
  renewals,
  showMoney,
  canRenew,
  centerName,
  currency,
  onNavigateToStudent,
  onSelectRenew,
}: DashboardRenewalsCardProps) {
  if (renewals.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-yellow-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <RefreshCw size={18} className="text-yellow-500" /> طلاب محتاجين تجديد
        </h3>
        <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
          {renewals.filter((r) => r.info.state === 'expired').length} خلص •{' '}
          {renewals.filter((r) => r.info.state === 'expiring').length} بيخلص
        </span>
      </div>
      <div className="p-3 space-y-2">
        {renewals.slice(0, 8).map((r) => (
          <div
            key={`${r.studentId}-${r.groupId}`}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-yellow-50/60 transition-colors"
          >
            <button onClick={() => onNavigateToStudent(r.studentId)} className="flex-1 min-w-0 text-right">
              <p className="text-sm font-semibold text-gray-900 truncate">{r.studentName}</p>
              <p className="text-xs text-gray-500 truncate">
                {r.groupName} • {r.courseName} • {r.teacherName}
                {showMoney && r.remaining > 0 && (
                  <span className="text-red-500"> • باقي عليه {formatCurrency(r.remaining, currency)}</span>
                )}
              </p>
            </button>
            <div className="text-left flex-shrink-0">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  r.info.state === 'expired' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'
                }`}
              >
                {RENEWAL_STATE_LABEL[r.info.state]}
              </span>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {r.info.endDate ? formatDate(r.info.endDate) : ''}
                {typeof r.info.daysLeft === 'number' &&
                  (r.info.daysLeft > 0 ? ` · باقي ${r.info.daysLeft} يوم` : ` · من ${Math.abs(r.info.daysLeft)} يوم`)}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {r.parentPhone && (
                <a
                  href={getWhatsAppLink(
                    r.parentPhone,
                    `السلام عليكم، معكم ${centerName || 'المركز'}.\nشهر ${r.studentName} في ${r.groupName} ${
                      r.info.state === 'expired' ? 'خلص' : 'بيخلص'
                    }${r.info.endDate ? ` (${formatDate(r.info.endDate)})` : ''}. يسعدنا استمراركم معنا — برجاء التواصل لتجديد الشهر.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                  title={`واتساب ولي الأمر ${r.parentPhone}`}
                >
                  <MessageCircle size={15} />
                </a>
              )}
              {canRenew && (
                <button
                  onClick={() => onSelectRenew(r)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                >
                  تجديد
                </button>
              )}
            </div>
          </div>
        ))}
        {renewals.length > 8 && (
          <p className="text-xs text-gray-400 text-center pt-1">
            و{renewals.length - 8} طالب آخر — افتح ملف الطالب
          </p>
        )}
      </div>
    </div>
  );
}
