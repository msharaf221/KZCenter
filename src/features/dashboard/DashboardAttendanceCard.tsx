import { Users2 } from 'lucide-react';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardAttendanceCardProps {
  todayAttendance: DashboardData['todayAttendance'];
}

export default function DashboardAttendanceCard({ todayAttendance }: DashboardAttendanceCardProps) {
  const items = [
    { label: 'حاضر', value: todayAttendance.present, cls: 'bg-green-50 text-green-700' },
    { label: 'غائب', value: todayAttendance.absent, cls: 'bg-red-50 text-red-700' },
    { label: 'متأخر', value: todayAttendance.late, cls: 'bg-yellow-50 text-yellow-700' },
    { label: 'مستأذن', value: todayAttendance.excused, cls: 'bg-blue-50 text-blue-700' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <Users2 size={18} className="text-indigo-500" /> حضور اليوم
        </h3>
        <span className="text-xs text-gray-400">{todayAttendance.recordedGroups} مجموعة مسجّلة</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {items.map((it) => (
          <div key={it.label} className={`rounded-xl p-3 text-center ${it.cls}`}>
            <p className="text-2xl font-bold">{it.value}</p>
            <p className="text-xs font-medium mt-0.5">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
