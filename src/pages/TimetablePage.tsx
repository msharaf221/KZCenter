/**
 * الجدول الأسبوعي + كشف التعارضات
 *
 * قبل كده الجدول كان مخزّن جوّه كل مجموعة من غير أي عرض موحد ولا فحص:
 * ممكن مدرس يتحط في مجموعتين في نفس الميعاد، أو قاعة تتحجز مرتين، أو طالب
 * يسجّل في مجموعتين متعارضتين — وكل ده كان بيعدي من غير أي تنبيه.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, AlertTriangle, Printer, Users, CheckCircle2, UserPlus, ArrowUpCircle, XCircle } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Badge from '../components/ui/Badge';
import {
  buildTimetable, findScheduleConflicts, loadTimetableData, todayKey,
  DAY_LABEL, DAY_KEYS, type DayKey, type ScheduleConflict,
} from '../lib/schedule';
import { getWaitlist, addToWaitlist, promoteFromWaitlist, removeFromWaitlist } from '../lib/waitlist';
import type { WaitlistEntry } from '../lib/db';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import { useAuth } from '../contexts/AuthContext';
import { visibleGroupIds } from '../lib/permissions';
import { printTable } from '../lib/printing';
import { getContrastColor } from '../lib/utils';

const HOURS = ['12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];

export default function TimetablePage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const primary = settings?.primaryColor || '#6366f1';

  const [data, setData] = useState<Awaited<ReturnType<typeof loadTimetableData>> | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [day, setDay] = useState<DayKey | 'all'>(todayKey());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loadTimetableData();
      setData(d);
      setWaitlist(await getWaitlist());
    } finally {
      setLoading(false);
    }
  }, []);

  // حالة نموذج إضافة لقائمة الانتظار
  const [wlStudent, setWlStudent] = useState('');
  const [wlGroup, setWlGroup] = useState('');
  const [wlNotes, setWlNotes] = useState('');
  const [wlBusy, setWlBusy] = useState(false);

  async function handleAddWaitlist() {
    if (!wlStudent || !wlGroup) { notify.error('اختر الطالب والمجموعة'); return; }
    setWlBusy(true);
    try {
      const r = await addToWaitlist({ studentId: wlStudent, groupId: wlGroup, notes: wlNotes || undefined });
      if (r.success) { notify.success('تمت الإضافة لقائمة الانتظار'); setWlStudent(''); setWlNotes(''); void load(); }
      else notify.error(r.error || 'تعذّرت الإضافة');
    } finally { setWlBusy(false); }
  }

  async function handlePromote(entryId: string) {
    setWlBusy(true);
    try {
      const r = await promoteFromWaitlist({ entryId });
      if (r.success) { notify.success('تمت ترقية الطالب وتسجيله في المجموعة'); void load(); }
      else notify.error(r.error || 'تعذّرت الترقية');
    } finally { setWlBusy(false); }
  }

  async function handleRemoveWaitlist(entryId: string) {
    setWlBusy(true);
    try {
      await removeFromWaitlist(entryId, 'أُلغي من الواجهة');
      notify.success('تمت الإزالة من قائمة الانتظار');
      void load();
    } finally { setWlBusy(false); }
  }

  useEffect(() => { void load(); }, [load]);

  // عزل بيانات المدرس على مجموعاته هو
  const scopedGroups = useMemo(() => {
    if (!data) return [];
    const allowed = visibleGroupIds({ role: user?.role, teacherId: user?.teacherId, groups: data.groups });
    if (!allowed) return data.groups;
    return data.groups.filter(g => allowed.has(g.id));
  }, [data, user?.role, user?.teacherId]);

  const timetable = useMemo(
    () => buildTimetable({
      groups: scopedGroups,
      teacherNames: data?.teacherNames,
      courseNames: data?.courseNames,
      enrollments: data?.enrollments,
    }),
    [scopedGroups, data],
  );

  const conflicts: ScheduleConflict[] = useMemo(
    () => findScheduleConflicts({
      groups: scopedGroups,
      teacherNames: data?.teacherNames,
      enrollments: data?.enrollments,
      studentNames: data?.studentNames,
    }),
    [scopedGroups, data],
  );

  const conflictGroupIds = useMemo(
    () => new Set(conflicts.flatMap(c => c.groupIds)),
    [conflicts],
  );

  const days = day === 'all' ? timetable.days : [day];
  const waiting = waitlist.filter(w => w.status === 'waiting' && !w.deleted);

  function handlePrint() {
    const rows: Record<string, unknown>[] = [];
    for (const d of timetable.days) {
      for (const cell of timetable.cells.filter(c => c.day === d)) {
        for (const g of cell.groups) {
          rows.push({
            day: DAY_LABEL[d],
            time: `${g.start}–${g.end}`,
            group: g.name,
            course: g.courseName,
            teacher: g.teacherName,
            room: g.room || '—',
            students: `${g.students}/${g.maxStudents}`,
          });
        }
      }
    }
    printTable({
      title: 'الجدول الأسبوعي',
      settings,
      rows,
      columns: [
        { key: 'day', label: 'اليوم' },
        { key: 'time', label: 'الميعاد' },
        { key: 'group', label: 'المجموعة' },
        { key: 'course', label: 'الكورس' },
        { key: 'teacher', label: 'المدرس' },
        { key: 'room', label: 'القاعة', align: 'center' },
        { key: 'students', label: 'الطلاب', align: 'center' },
      ],
      totals: [{ label: 'عدد الحصص الأسبوعية', value: String(rows.length) }],
    });
  }

  if (loading || !data) {
    return (
      <Layout title="الجدول الأسبوعي">
        <div className="py-20 text-center text-gray-400">جاري تحميل الجدول...</div>
      </Layout>
    );
  }

  return (
    <Layout title="الجدول الأسبوعي">
      <div className="space-y-5">
        {/* التنبيهات */}
        {conflicts.length > 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-red-600" />
              <h3 className="text-sm font-bold text-red-800">
                فيه {conflicts.length} تعارض في الجدول لازم يتحل
              </h3>
              <button onClick={() => setShowConflictsOnly(v => !v)}
                className="mr-auto text-xs px-2.5 py-1.5 bg-white border border-red-200 rounded-lg text-red-700 hover:bg-red-100">
                {showConflictsOnly ? 'عرض الجدول كامل' : 'إظهار المجموعات المتعارضة بس'}
              </button>
            </div>
            <div className="space-y-2">
              {conflicts.slice(0, 12).map((c, i) => (
                <div key={i} className="flex items-start gap-2 bg-white rounded-xl p-3 border border-red-100">
                  <Badge status={c.kind === 'teacher' ? 'late' : c.kind === 'room' ? 'suspended' : 'pending'}
                    label={c.kind === 'teacher' ? 'مدرس' : c.kind === 'room' ? 'قاعة' : 'طالب'} />
                  <p className="text-xs text-gray-700 leading-relaxed">{c.message}</p>
                </div>
              ))}
              {conflicts.length > 12 && (
                <p className="text-xs text-red-600 font-medium">و{conflicts.length - 12} تعارضات أخرى...</p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <p className="text-sm font-medium text-green-800">الجدول سليم — مفيش تعارضات في المدرسين أو القاعات أو الطلاب</p>
          </div>
        )}

        {/* شريط التحكم */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setDay('all')}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${day === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              style={day === 'all' ? { backgroundColor: primary, color: getContrastColor(primary) } : {}}>
              الأسبوع كامل
            </button>
            {DAY_KEYS.map(d => (
              <button key={d} onClick={() => setDay(d)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${day === d ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                style={day === d ? { backgroundColor: primary, color: getContrastColor(primary) } : {}}>
                {DAY_LABEL[d]}
                {d === todayKey() && <span className="mr-1 text-[10px]">•</span>}
              </button>
            ))}
          </div>
          <button onClick={handlePrint}
            className="mr-auto flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
            <Printer size={16} /> طباعة الجدول
          </button>
        </div>

        {/* الشبكة */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <CalendarDays size={17} className="text-indigo-500" />
            <h3 className="text-base font-bold text-gray-900">
              {day === 'all' ? 'الجدول الأسبوعي' : DAY_LABEL[day]}
            </h3>
            <span className="text-xs text-gray-400 mr-auto">
              {timetable.cells.reduce((s, c) => s + c.groups.length, 0)} حصة في الأسبوع
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-500 w-20">الميعاد</th>
                  {days.map(d => (
                    <th key={d} className="px-3 py-2.5 text-right text-xs font-bold text-gray-500">
                      {DAY_LABEL[d]}
                      {d === todayKey() && <span className="text-indigo-500"> (النهاردة)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => {
                  const hasAny = days.some(d =>
                    timetable.cells.some(c => c.day === d && c.slot === hour),
                  );
                  if (!hasAny && day === 'all') return null;

                  return (
                    <tr key={hour} className="border-t border-gray-50 align-top">
                      <td className="px-3 py-2 text-xs font-bold text-gray-500 whitespace-nowrap">{hour}</td>
                      {days.map(d => {
                        const cell = timetable.cells.find(c => c.day === d && c.slot === hour);
                        return (
                          <td key={d} className="px-2 py-2">
                            <div className="space-y-1.5">
                              {(cell?.groups || []).map(g => {
                                const conflicted = conflictGroupIds.has(g.id);
                                const hidden = showConflictsOnly && !conflicted;
                                if (hidden) return null;
                                const full = g.students >= g.maxStudents;
                                return (
                                  <div key={`${g.id}-${hour}-${d}`}
                                    className={`rounded-xl p-2.5 border text-xs transition-colors ${
                                      conflicted ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100 hover:border-indigo-200'
                                    }`}>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-gray-900 truncate">{g.name}</span>
                                      {conflicted && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                                    </div>
                                    <p className="text-[11px] text-gray-500 truncate">{g.courseName}</p>
                                    <p className="text-[11px] text-gray-600 mt-1">{g.teacherName}</p>
                                    <div className="flex items-center justify-between mt-1.5">
                                      <span className="text-[10px] text-gray-400">{g.start}–{g.end}</span>
                                      <span className={`flex items-center gap-1 text-[10px] font-bold ${full ? 'text-orange-600' : 'text-green-600'}`}>
                                        <Users size={10} /> {g.students}/{g.maxStudents}
                                      </span>
                                    </div>
                                    {g.room && <p className="text-[10px] text-gray-400 mt-0.5">قاعة {g.room}</p>}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {timetable.cells.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 1} className="py-16 text-center text-gray-400">
                      مفيش مجموعات بجدول محدد — حدّد أيام ومواعيد المجموعات من صفحة المجموعات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* قائمة الانتظار: إضافة + ترقية + إزالة */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Users size={16} className="text-orange-500" /> قائمة الانتظار ({waiting.length})
          </h3>

          {/* نموذج إضافة */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 p-3 bg-gray-50 rounded-xl">
            <select value={wlStudent} onChange={e => setWlStudent(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">— اختر طالب —</option>
              {Object.entries(data.studentNames).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select value={wlGroup} onChange={e => setWlGroup(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">— اختر مجموعة —</option>
              {scopedGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}{(g.studentIds || []).length >= g.maxStudents ? ' (مكتملة)' : ''}</option>
              ))}
            </select>
            <input value={wlNotes} onChange={e => setWlNotes(e.target.value)} placeholder="ملاحظة (اختياري)"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <button onClick={handleAddWaitlist} disabled={wlBusy}
              className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: primary }}>
              <UserPlus size={15} /> إضافة للانتظار
            </button>
          </div>

          {waiting.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">مفيش طلاب في قائمة الانتظار حالياً.</p>
          ) : (
            <div className="space-y-2">
              {waiting.slice(0, 20).map(w => (
                <div key={w.id} className="flex items-center justify-between gap-2 p-3 bg-orange-50 rounded-xl text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{data.studentNames[w.studentId] || 'طالب'}</p>
                    <p className="text-xs text-gray-500 truncate">
                      في انتظار مجموعة {data.groups.find(g => g.id === w.groupId)?.name || '—'}
                      {w.notes ? ` · ${w.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-gray-400 ml-2">{w.addedAt?.slice(0, 10)}</span>
                    <button onClick={() => handlePromote(w.id)} disabled={wlBusy} title="ترقية وتسجيل في المجموعة"
                      className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
                      <ArrowUpCircle size={15} />
                    </button>
                    <button onClick={() => handleRemoveWaitlist(w.id)} disabled={wlBusy} title="إزالة من القائمة"
                      className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50">
                      <XCircle size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
