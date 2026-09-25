import dayjs from 'dayjs';
import { AlertCircle, CheckCircle, Clock, LogOut, MessageCircle, Printer, Save, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import ResourceError from '../components/ui/ResourceError';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { AttendanceStatus } from '../domain/models';
import { useCommandTask } from '../hooks/useCommandTask';
import { usePageResource } from '../hooks/usePageResource';
import { useResourceDraft } from '../hooks/useResourceDraft';
import { checkAbsenceAlertForStudent } from '../lib/absenceAlerts';
import { notify, notifyAbsence, notifyAttendanceSaved, notifyRepeatedAbsence } from '../lib/notifications';
import { printTable } from '../lib/printing';
import { formatDate, getContrastColor, getWhatsAppLink } from '../lib/utils';
import { checkOutStudent, saveAttendance } from '../services/commands/academic';
import { loadAttendanceCatalog, loadAttendanceRegister, type AttendanceRegister } from '../services/queries/attendance';

export default function AttendancePage() {
  const task = useCommandTask();
  const { settings } = useApp();
  const { user, can } = useAuth();
  const canRecord = can('attendance', 'create') || can('attendance', 'edit');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const saving = task.pending;
  /** الطلاب اللي التحقوا بالمجموعة بعد تاريخ الكشف — ماينفعش يتسجللهم غياب عن يوم قبل ما يدخلوا */

  const catalogQuery = useCallback(() => loadAttendanceCatalog(user?.role, user?.teacherId), [user?.role, user?.teacherId]);
  const { data: { groups, courses }, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = usePageResource(catalogQuery, { groups: [], courses: [] });
  useEffect(() => {
    if (!catalogLoading && !groups.some(group => group.id === selectedGroup)) setSelectedGroup(groups[0]?.id || '');
  }, [catalogLoading, groups, selectedGroup]);
  const registerQuery = useCallback(() => loadAttendanceRegister(selectedGroup, selectedDate), [selectedGroup, selectedDate]);
  const { value: register, setValue: setRegister, ready: registerReady, error: registerError, reload: loadAttendance } = useResourceDraft<AttendanceRegister>(
    `${selectedGroup}:${selectedDate}`, registerQuery,
    { records: [], students: [], statuses: {}, lateJoiners: new Set() },
    !catalogLoading && !catalogError && !!selectedDate && groups.some(group => group.id === selectedGroup),
  );
  const { records: existingAttendance, students: groupStudents, statuses: attendanceMap, lateJoiners } = register;
  function setAttendanceMap(action: SetStateAction<Record<string, AttendanceStatus>>) {
    setRegister(current => ({ ...current, statuses: typeof action === 'function' ? action(current.statuses) : action }));
  }

  const group = groups.find(g => g.id === selectedGroup);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  }

  function setAll(status: AttendanceStatus) {
    setAttendanceMap(prev => {
      const map: Record<string, AttendanceStatus> = { ...prev };
      groupStudents.forEach(s => {
        // اللي التحق بعد تاريخ الكشف ماياخدش حالة بالجملة (مكانش موجود)
        if (lateJoiners.has(s.id)) return;
        map[s.id] = status;
      });
      return map;
    });
  }

  async function handleSave() {
    if (!registerReady) return;
    await task.run(async () => {
      const saved = await saveAttendance(user, { groupId: selectedGroup, date: selectedDate, studentIds: groupStudents.map(student => student.id), statuses: attendanceMap });
      for (const student of saved.newlyAbsent) notifyAbsence(student.name, saved.group.name);
      for (const student of saved.absent) {
        try {
          const alert = await checkAbsenceAlertForStudent(student.id, saved.group.id);
          if (alert) notifyRepeatedAbsence(student.name, saved.group.name, alert.streak);
        } catch (error) { console.error('absence alert check error:', error); }
      }
      notifyAttendanceSaved(saved.group.name, saved.savedCount);
      await loadAttendance();
    });
  }

  async function handleCheckOut(studentId: string) {
    const record = existingAttendance.find(row => row.studentId === studentId);
    if (!record) { notify.error('يجب تسجيل الحضور أولاً'); return; }
    await task.run(async () => { await checkOutStudent(user, record.id); notify.success('تم تسجيل وقت الخروج'); await loadAttendance(); });
  }

  /** ورقة حضور قابلة للطباعة (RTL) للقائمة والحالة الحالية */
  function handlePrintSheet() {
    if (!selectedGroup || !registerReady) { notify.error('انتظر تحميل كشف الحضور أولاً'); return; }
    const group = groups.find(g => g.id === selectedGroup);
    const course = courses.find(c => c.id === group?.courseId);
    const statusLabel: Record<AttendanceStatus, string> = {
      present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'مستأذن',
    };
    const rows = eligibleStudents.map((s, i) => ({
      no: i + 1,
      name: s.name,
      status: attendanceMap[s.id] ? statusLabel[attendanceMap[s.id]] : statusLabel.absent,
    }));
    printTable({
      title: `ورقة حضور — ${group?.name ?? ''}`,
      subtitle: course ? `كورس: ${course.name}` : undefined,
      settings,
      meta: [
        { label: 'التاريخ', value: formatDate(selectedDate, 'YYYY/MM/DD') },
        { label: 'المجموعة', value: group?.name ?? '' },
      ],
      totals: [
        { label: 'حاضر', value: String(counts.present) },
        { label: 'غائب', value: String(counts.absent) },
        { label: 'متأخر', value: String(counts.late) },
        { label: 'مستأذن', value: String(counts.excused) },
      ],
      rows,
      columns: [
        { key: 'no', label: '#', align: 'center', width: '40px' },
        { key: 'name', label: 'اسم الطالب' },
        { key: 'status', label: 'الحالة', align: 'center' },
      ],
    });
  }

  const statusButtons = [
    { status: 'present' as AttendanceStatus, label: 'حاضر', icon: <CheckCircle size={14} />, color: 'bg-green-100 text-green-700 border-green-200' },
    { status: 'absent' as AttendanceStatus, label: 'غائب', icon: <XCircle size={14} />, color: 'bg-red-100 text-red-700 border-red-200' },
    { status: 'late' as AttendanceStatus, label: 'متأخر', icon: <Clock size={14} />, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { status: 'excused' as AttendanceStatus, label: 'مستأذن', icon: <AlertCircle size={14} />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ];

  /** الطلاب اللي ينطبق عليهم الكشف ده (الموجودين فعلًا في تاريخه) */
  const eligibleStudents = groupStudents.filter(s => !lateJoiners.has(s.id));

  const counts = {
    present: eligibleStudents.filter(s => attendanceMap[s.id] === 'present').length,
    absent: eligibleStudents.filter(s => (attendanceMap[s.id] || 'absent') === 'absent').length,
    late: eligibleStudents.filter(s => attendanceMap[s.id] === 'late').length,
    excused: eligibleStudents.filter(s => attendanceMap[s.id] === 'excused').length,
  };

  if (catalogError) return <PageReadError title="تسجيل الحضور" onRetry={reloadCatalog} />;

  return (
    <Layout title="تسجيل الحضور">
      <div className="space-y-5">
        {registerError && <ResourceError onRetry={loadAttendance} />}
        {/* Controls */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المجموعة</label>
              <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                {groups.map(g => {
                  const c = courses.find(c => c.id === g.courseId);
                  return <option key={g.id} value={g.id}>{g.name} - {c?.name}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handlePrintSheet} disabled={!registerReady} title="طباعة ورقة الحضور"
                className="py-2.5 px-3 bg-gray-50 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors no-print">
                <Printer size={16} />
              </button>
              <button onClick={() => setAll('present')}
                className="flex-1 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 transition-colors">
                ✓ الكل حاضر
              </button>
              <button onClick={() => setAll('absent')}
                className="flex-1 py-2.5 bg-red-50 text-red-700 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
                ✗ الكل غائب
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'حاضر', count: counts.present, color: 'text-green-600 bg-green-50' },
              { label: 'غائب', count: counts.absent, color: 'text-red-600 bg-red-50' },
              { label: 'متأخر', count: counts.late, color: 'text-yellow-600 bg-yellow-50' },
              { label: 'مستأذن', count: counts.excused, color: 'text-blue-600 bg-blue-50' },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-xl text-center ${item.color}`}>
                <p className="text-2xl font-bold">{registerReady ? item.count : '—'}</p>
                <p className="text-xs font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Students List */}
        {group && groupStudents.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">طلاب: {group.name}</h3>
              <p className="text-sm text-gray-500">{groupStudents.length} طالب • {formatDate(selectedDate)}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {groupStudents.map((student, idx) => {
                const status = attendanceMap[student.id];
                const attendance = existingAttendance.find(r => r.studentId === student.id);
                const isLateJoiner = lateJoiners.has(student.id) && !attendance;
                return (
                  <div key={student.id} className={`flex items-center gap-4 p-4 transition-colors ${isLateJoiner ? 'bg-gray-50/60 opacity-70' : 'hover:bg-gray-50'}`}>
                    <span className="w-6 text-sm text-gray-400 font-medium">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-lg">
                      {student.gender === 'male' ? '👦' : '👧'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                        {student.name}
                        {isLateJoiner && (
                          <span className="px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-600 text-[10px] font-bold">
                            التحق بعد هذا التاريخ — لا يُحتسب
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{student.parentPhone}</p>
                      {attendance?.checkInTime && (
                        <p className="text-xs text-green-600">دخول: {attendance.checkInTime}
                          {attendance.checkOutTime && ` • خروج: ${attendance.checkOutTime}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isLateJoiner && (
                        <span className="text-[11px] text-gray-400 ml-2">غير مشمول بالكشف</span>
                      )}
                      {statusButtons.map(btn => (
                        <button key={btn.status}
                          disabled={isLateJoiner}
                          onClick={() => !isLateJoiner && setStatus(student.id, btn.status)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed
                            ${status === btn.status ? btn.color + ' border-current shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'}`}>
                          {btn.icon}
                          <span className="hidden sm:inline">{btn.label}</span>
                        </button>
                      ))}
                      {!isLateJoiner && status === 'present' && attendance && !attendance.checkOutTime && (
                        <button onClick={() => handleCheckOut(student.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100">
                          <LogOut size={14} />
                          <span className="hidden sm:inline">خروج</span>
                        </button>
                      )}
                      {!isLateJoiner && status === 'absent' && student.parentPhone && (
                        <a href={getWhatsAppLink(student.parentPhone, `نود إعلامكم بغياب الطالب/ة ${student.name} عن مجموعة ${group.name} بتاريخ ${formatDate(selectedDate)}.`)}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-green-50 text-green-700 border-green-200 hover:bg-green-100" title="إرسال عبر واتساب">
                          <MessageCircle size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100">
              <button onClick={handleSave} disabled={saving || !canRecord || !registerReady}
                title={canRecord ? '' : 'ليس لديك صلاحية تسجيل الحضور'}
                className="w-full flex items-center justify-center gap-2 py-3 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-60"
                style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
                <Save size={18} />
                {saving ? 'جاري الحفظ...' : 'حفظ الحضور'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-400 text-lg">
              {!selectedGroup ? 'اختر مجموعة لتسجيل الحضور' : 'لا يوجد طلاب في هذه المجموعة'}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
