import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, LogOut, Save, MessageCircle, Printer } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { dbGetAll, dbGetByIndex, dbAdd, dbPut, getGroupAttendanceForDate, getGroupStudents, generateId, Group, Student, Course, Attendance, AttendanceStatus, Enrollment } from '../lib/db';
import { formatDate, getWhatsAppLink, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify, notifyAttendanceSaved, notifyAbsence, notifyRepeatedAbsence } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { printTable } from '../lib/printing';
import { checkAbsenceAlertForStudent } from '../lib/absenceAlerts';
import dayjs from 'dayjs';

export default function AttendancePage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [existingAttendance, setExistingAttendance] = useState<Attendance[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [groupStudents, setGroupStudents] = useState<Student[]>([]);
  /** الطلاب اللي التحقوا بالمجموعة بعد تاريخ الكشف — ماينفعش يتسجللهم غياب عن يوم قبل ما يدخلوا */
  const [lateJoiners, setLateJoiners] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGroup && selectedDate) {
      loadAttendance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- مقصود: إعادة التحميل مربوطة بالـ deps المكتوبة بس
  }, [selectedGroup, selectedDate]);

  async function loadData() {
    const [g, c] = await Promise.all([
      dbGetAll<Group>('groups'),
      dbGetAll<Course>('courses'),
    ]);
    setGroups(g);
    setCourses(c);
    if (g.length > 0) setSelectedGroup(g[0].id);
  }

  async function loadAttendance() {
    const records = await getGroupAttendanceForDate(selectedGroup, selectedDate);
    setExistingAttendance(records);
    const map: Record<string, AttendanceStatus> = {};
    records.forEach(r => { map[r.studentId] = r.status; });
    setAttendanceMap(map);
    // Load enrolled students via enrollments table (source of truth)
    if (selectedGroup) {
      const enrolled = await getGroupStudents(selectedGroup);
      setGroupStudents(enrolled);

      // طالب التحق بعد تاريخ الكشف؟ يطلع من حساب الغياب (مكانش موجود أصلاً)
      const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-groupId', selectedGroup);
      const late = new Set<string>();
      const day = selectedDate.slice(0, 10);
      for (const e of enrollments) {
        if (e.status !== 'active' || e.deleted) continue;
        if ((e.enrolledAt || '').slice(0, 10) > day) late.add(e.studentId);
      }
      setLateJoiners(late);
    }
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
    if (!selectedGroup) { notify.error('اختر مجموعة أولاً'); return; }
    setSaving(true);
    try {
      let savedCount = 0;
      for (const student of groupStudents) {
        // طالب التحق بعد تاريخ الكشف ولا سجل قديم له؟ مايتسجلش غياب غلط عن يوم قبل ما يدخل
        const existing = existingAttendance.find(r => r.studentId === student.id);
        if (lateJoiners.has(student.id) && !existing) continue;

        const status = attendanceMap[student.id] || 'absent';
        savedCount++;

        const wasAbsent = existing ? existing.status === 'absent' : false;

        if (status === 'absent' && !wasAbsent) {
          notifyAbsence(student.name, group?.name || '');
        }

        if (existing) {
          await dbPut('attendance', {
            ...existing, status, updatedAt: new Date().toISOString(),
          });
        } else {
          const record: Attendance = {
            id: generateId(), studentId: student.id, groupId: selectedGroup,
            date: selectedDate, status,
            checkInTime: status === 'present' ? dayjs().format('HH:mm') : undefined,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          };
          await dbAdd('attendance', record);
        }

        // تنبيه الغياب المتكرر (3+ متتالية) — بعد الحفظ، للطلاب اللي حالتهم غائب
        if (status === 'absent') {
          try {
            const alert = await checkAbsenceAlertForStudent(student.id, selectedGroup);
            if (alert) notifyRepeatedAbsence(student.name, group?.name || '', alert.streak);
          } catch (e) {
            console.error('absence alert check error:', e);
          }
        }
      }
      notifyAttendanceSaved(group?.name || '', savedCount);
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'update', entity: 'attendance', entityId: selectedGroup,
        details: `تسجيل حضور: ${group?.name || ''} - ${formatDate(selectedDate)} (${savedCount} طالب)`,
      });
      loadAttendance();
    } catch { notify.error('حدث خطأ أثناء الحفظ'); }
    finally { setSaving(false); }
  }

  async function handleCheckOut(studentId: string) {
    const existing = existingAttendance.find(r => r.studentId === studentId);
    if (!existing) { notify.error('يجب تسجيل الحضور أولاً'); return; }
    try {
      await dbPut('attendance', {
        ...existing, checkOutTime: dayjs().format('HH:mm'), updatedAt: new Date().toISOString(),
      });
      notify.success('تم تسجيل وقت الخروج');
      loadAttendance();
    } catch { notify.error('حدث خطأ'); }
  }

  /** ورقة حضور قابلة للطباعة (RTL) للقائمة والحالة الحالية */
  function handlePrintSheet() {
    if (!selectedGroup) { notify.error('اختر مجموعة الأول'); return; }
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

  return (
    <Layout title="تسجيل الحضور">
      <div className="space-y-5">
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
              <button onClick={handlePrintSheet} title="طباعة ورقة الحضور"
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
                <p className="text-2xl font-bold">{item.count}</p>
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
              <button onClick={handleSave} disabled={saving}
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
