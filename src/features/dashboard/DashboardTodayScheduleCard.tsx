import { formatDate, getArabicDay, getStatusLabel } from '../../lib/utils';
import type { DashboardData } from '../../services/queries/dashboard';

interface DashboardTodayScheduleCardProps {
  todayGroups: DashboardData['todayGroups'];
  recentStudents: DashboardData['recentStudents'];
  todayKey: string;
}

export default function DashboardTodayScheduleCard({
  todayGroups,
  recentStudents,
  todayKey,
}: DashboardTodayScheduleCardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Today's Groups */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            حصص اليوم - {getArabicDay(todayKey)}
          </h3>
        </div>
        <div className="p-3">
          {todayGroups.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">لا توجد حصص اليوم</p>
          ) : (
            <div className="space-y-2">
              {todayGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{group.name}</p>
                    <p className="text-xs text-gray-500">
                      {group.courseName} • {group.teacherName}
                    </p>
                  </div>
                  <div className="text-left">
                    {group.schedule
                      .filter((s) => s.days.includes(todayKey))
                      .map((s, i) => (
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
              {recentStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-lg">
                    {student.gender === 'male' ? '👦' : '👧'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                    <p className="text-xs text-gray-500">{student.parentPhone}</p>
                  </div>
                  <div className="text-left">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${student.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                    >
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
  );
}
