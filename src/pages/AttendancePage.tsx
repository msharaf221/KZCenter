import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, LogOut, Save, MessageCircle } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { dbGetAll, dbAdd, dbPut, getGroupAttendanceForDate, getGroupStudents, generateId, Group, Student, Course, Attendance, AttendanceStatus } from '../lib/db';
import { formatDate, getWhatsAppLink } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify, notifyAttendanceSaved, notifyAbsence } from '../lib/notifications';
import dayjs from 'dayjs';

export default function AttendancePage() {
  const { settings } = useApp();
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [existingAttendance, setExistingAttendance] = useState<Attendance[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [groupStudents, setGroupStudents] = useState<Student[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGroup && selectedDate) {
      loadAttendance();
    }
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
    }
  }

  const group = groups.find(g => g.id === selectedGroup);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  }

  function setAll(status: AttendanceStatus) {
    const map: Record<string, AttendanceStatus> = {};
    groupStudents.forEach(s => { map[s.id] = status; });
    setAttendanceMap(map);
  }

  async function handleSave() {
    if (!selectedGroup) { notify.error('اختر مجموعة أولاً'); return; }
    setSaving(true);
    try {
      for (const student of groupStudents) {
        const status = attendanceMap[student.id] || 'absent';
        
        const existing = existingAttendance.find(r => r.studentId === student.id);
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
      }
      notifyAttendanceSaved(group?.name || '', groupStudents.length);
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

  const statusButtons = [
    { status: 'present' as AttendanceStatus, label: 'حاضر', icon: <CheckCircle size={14} />, color: 'bg-green-100 text-green-700 border-green-200' },
    { status: 'absent' as AttendanceStatus, label: 'غائب', icon: <XCircle size={14} />, color: 'bg-red-100 text-red-700 border-red-200' },
    { status: 'late' as AttendanceStatus, label: 'متأخر', icon: <Clock size={14} />, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    { status: 'excused' as AttendanceStatus, label: 'مستأذن', icon: <AlertCircle size={14} />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ];

  const counts = {
    present: groupStudents.filter(s => attendanceMap[s.id] === 'present').length,
    absent: groupStudents.filter(s => attendanceMap[s.id] === 'absent').length,
    late: groupStudents.filter(s => attendanceMap[s.id] === 'late').length,
    excused: groupStudents.filter(s => attendanceMap[s.id] === 'excused').length,
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
                return (
                  <div key={student.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                    <span className="w-6 text-sm text-gray-400 font-medium">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-lg">
                      {student.gender === 'male' ? '👦' : '👧'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-500">{student.parentPhone}</p>
                      {attendance?.checkInTime && (
                        <p className="text-xs text-green-600">دخول: {attendance.checkInTime}
                          {attendance.checkOutTime && ` • خروج: ${attendance.checkOutTime}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {statusButtons.map(btn => (
                        <button key={btn.status}
                          onClick={() => setStatus(student.id, btn.status)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all
                            ${status === btn.status ? btn.color + ' border-current shadow-sm' : 'bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100'}`}>
                          {btn.icon}
                          <span className="hidden sm:inline">{btn.label}</span>
                        </button>
                      ))}
                      {status === 'present' && attendance && !attendance.checkOutTime && (
                        <button onClick={() => handleCheckOut(student.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100">
                          <LogOut size={14} />
                          <span className="hidden sm:inline">خروج</span>
                        </button>
                      )}
                      {status === 'absent' && student.parentPhone && (
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
                style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
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
