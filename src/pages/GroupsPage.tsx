import { Plus, Search, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import RenewDialog from '../components/RenewDialog';
import SessionPicker from '../components/SessionPicker';
import TransferDialog from '../components/TransferDialog';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { Group, GroupStatus, ScheduleItem } from '../domain/models';
import { useCommandTask } from '../hooks/useCommandTask';
import { usePageResource } from '../hooks/usePageResource';
import { resolveSessionsPerMonth } from '../lib/billing';
import { notify } from '../lib/notifications';
import { SUBJECTS, getSubject, type SubjectId } from '../lib/subjects';
import { getContrastColor } from '../lib/utils';
import { deleteCatalogRecord, saveGroup } from '../services/commands/catalog';
import { enrollGroupStudent, removeGroupStudent } from '../services/commands/studentFinance';
import { loadGroupsCatalog } from '../services/queries/groups';

const DAYS = [
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
  { key: 'saturday', label: 'السبت' },
];

export default function GroupsPage() {
  const task = useCommandTask();
  const navigate = useNavigate();
  const { settings } = useApp();
  const { user, can } = useAuth();
  const canWrite = can('groups', 'create') || can('groups', 'edit');
  const canDelete = can('groups', 'delete');
  const [search, setSearch] = useState('');
  /** فلتر بالمادة ('' = الكل) */
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewGroup, setViewGroup] = useState<Group | null>(null);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [paymentAmountToAdd, setPaymentAmountToAdd] = useState<number | ''>('');
  const [startSessionToAdd, setStartSessionToAdd] = useState(1);
  const [transferTarget, setTransferTarget] = useState<{ studentId: string; studentName: string; fromGroupId: string } | null>(null);
  const [renewTarget, setRenewTarget] = useState<{ studentId: string; studentName: string; groupId: string } | null>(null);
  const [form, setForm] = useState({
    name: '', courseId: '', levelId: '', teacherId: '',
    maxStudents: 20, status: 'open' as GroupStatus,
    schedule: [{ days: [], startTime: '09:00', endTime: '10:00', room: '' }] as ScheduleItem[],
  });

  const query = useCallback(() => loadGroupsCatalog({ search, subjectFilter, role: user?.role, teacherId: user?.teacherId }), [search, subjectFilter, user?.role, user?.teacherId]);
  const { data: { groups, courses, teachers, students }, loading, reload: load, error } = usePageResource(query, {
    groups: [], courses: [], teachers: [], students: [],
  });

  function openAdd() {
    setEditing(null);
    setForm({ name: '', courseId: courses[0]?.id || '', levelId: '', teacherId: teachers[0]?.id || '', maxStudents: 20, status: 'open', schedule: [{ days: [], startTime: '09:00', endTime: '10:00', room: '' }] });
    setShowModal(true);
  }

  function openEdit(g: Group) {
    setEditing(g);
    setForm({ name: g.name, courseId: g.courseId, levelId: g.levelId || '', teacherId: g.teacherId, maxStudents: g.maxStudents, status: g.status, schedule: [...g.schedule] });
    setShowModal(true);
  }

  function toggleDay(schedIdx: number, day: string) {
    setForm(f => {
      const schedule = [...f.schedule];
      const s = { ...schedule[schedIdx] };
      s.days = s.days.includes(day) ? s.days.filter(d => d !== day) : [...s.days, day];
      schedule[schedIdx] = s;
      return { ...f, schedule };
    });
  }

  async function handleSave() {
    await task.run(async () => {
      await saveGroup(user, form, editing?.id);
      notify.success(editing ? 'تم تحديث المجموعة' : 'تمت الإضافة بنجاح');

      setShowModal(false);
      await load();
    });
  }

  async function refreshViewedGroup(groupId: string) {
    const result = await load();
    const fresh = result?.groups.find(group => group.id === groupId);
    if (task.isActive()) setViewGroup(current => current?.id === groupId ? fresh || null : current);
  }
  async function removeStudentFromGroup(groupId: string, studentId: string) {
    await task.run(async () => {
      await removeGroupStudent(user, studentId, groupId, 'إزالة يدوية من صفحة المجموعات');
      notify.success('تم إزالة الطالب من المجموعة');
      await refreshViewedGroup(groupId);
    });
  }
  async function addStudentToGroup(groupId: string, studentId: string) {
    if (!studentId) return;
    await task.run(async () => {
      await enrollGroupStudent(user, studentId, groupId, paymentAmountToAdd || undefined, { startSession: startSessionToAdd, paymentMethod: 'cash' });
      notify.success('تم إضافة الطالب إلى المجموعة');
      await refreshViewedGroup(groupId);
      if (!task.isActive()) return;
      setSelectedStudentToAdd(''); setPaymentAmountToAdd(''); setStartSessionToAdd(1);
    });
  }

  const selectedCourse = courses.find(c => c.id === form.courseId);
  const fillPercent = (group: Group) => group.maxStudents > 0 ? Math.round((group.studentIds.length / group.maxStudents) * 100) : 0;

  if (error) return <PageReadError title="المجموعات" onRetry={load} />;

  return (
    <Layout title="إدارة المجموعات">
      <div className="space-y-5">
        <div role="group" aria-label="إجراءات المجموعات" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3 max-w-full">
          <div className="flex-1 min-w-0 basis-full sm:basis-0 relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم..."
              className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value as SubjectId | '')}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none">
            <option value="">كل المواد</option>
            {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
          {canWrite && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
              style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
              <Plus size={16} /> إضافة مجموعة
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map(group => {
              const course = courses.find(c => c.id === group.courseId);
              const teacher = teachers.find(t => t.id === group.teacherId);
              const fp = fillPercent(group);
              return (
                <div key={group.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900">{group.name}</h3>
                      <p className="text-xs text-gray-500">{course?.name} {course?.icon}</p>
                      {(() => {
                        const subject = getSubject(group.subjectId ?? course?.subjectId);
                        return subject ? (
                          <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: subject.color }}>
                            {subject.icon} {subject.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <Badge status={group.status} />
                  </div>
                  <p className="text-xs text-gray-600 mb-2">👨‍🏫 {teacher?.name || 'غير محدد'}</p>

                  {/* Fill bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{group.studentIds.length} / {group.maxStudents} طالب</span>
                      <span>{fp}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all"
                        style={{ width: `${fp}%`, backgroundColor: fp >= 90 ? '#ef4444' : fp >= 70 ? '#f97316' : settings?.primaryColor || '#6366f1' }} />
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="text-xs text-gray-500 mb-3">
                    {group.schedule.map((s, i) => (
                      <div key={i}>
                        {s.days.map(d => DAYS.find(dd => dd.key === d)?.label).join('، ')} • {s.startTime} - {s.endTime}
                        {s.room && ` • قاعة: ${s.room}`}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setViewGroup(group)} className="flex-1 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1">
                      <Users size={12} /> الطلاب
                    </button>
                    {canWrite && <button onClick={() => openEdit(group)} className="flex-1 py-1.5 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors">تعديل</button>}
                    {canDelete && <button onClick={() => setDeleteId(group.id)} className="flex-1 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">حذف</button>}
                  </div>
                </div>
              );
            })}
            {groups.length === 0 && <div className="col-span-3 text-center py-12 text-gray-400">لا توجد مجموعات</div>}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل المجموعة' : 'إضافة مجموعة'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المجموعة *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="مثال: الرياضيات - المجموعة أ" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الكورس *</label>
              <select value={form.courseId} onChange={e => setForm({ ...form, courseId: e.target.value, levelId: '' })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر كورساً</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}{c.subjectId ? ` — ${getSubject(c.subjectId)!.name} (${c.price})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المستوى</label>
              <select value={form.levelId} onChange={e => setForm({ ...form, levelId: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر مستوى</option>
                {selectedCourse?.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المدرس *</label>
              <select value={form.teacherId} onChange={e => setForm({ ...form, teacherId: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر مدرساً</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الحد الأقصى للطلاب</label>
              <input type="number" min={1} max={50} value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as GroupStatus })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="open">مفتوحة</option>
                <option value="full">مكتملة</option>
                <option value="ended">منتهية</option>
              </select>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">الجدول الزمني</label>
            {form.schedule.map((sched, idx) => (
              <div key={idx} className="border border-gray-100 rounded-xl p-3 mb-2">
                <div className="flex flex-wrap gap-1 mb-2">
                  {DAYS.map(d => (
                    <button key={d.key} type="button"
                      onClick={() => toggleDay(idx, d.key)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors
                        ${sched.days.includes(d.key) ? 'text-white' : 'bg-gray-100 text-gray-600'}`}
                      style={sched.days.includes(d.key) ? { backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') } : {}}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">من</label>
                    <input type="time" value={sched.startTime}
                      onChange={e => { const sc = [...form.schedule]; sc[idx] = { ...sc[idx], startTime: e.target.value }; setForm({ ...form, schedule: sc }); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">إلى</label>
                    <input type="time" value={sched.endTime}
                      onChange={e => { const sc = [...form.schedule]; sc[idx] = { ...sc[idx], endTime: e.target.value }; setForm({ ...form, schedule: sc }); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">القاعة</label>
                    <input type="text" value={sched.room || ''} placeholder="رقم القاعة"
                      onChange={e => { const sc = [...form.schedule]; sc[idx] = { ...sc[idx], room: e.target.value }; setForm({ ...form, schedule: sc }); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={task.pending} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            {editing ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      {/* View Students Modal */}
      {viewGroup && (
        <Modal isOpen={!!viewGroup} onClose={() => { setViewGroup(null); setSelectedStudentToAdd(''); setPaymentAmountToAdd(''); setStartSessionToAdd(1); }} title={`طلاب مجموعة: ${viewGroup.name}`} size="md">
          <div className="mb-4 space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={selectedStudentToAdd} onChange={e => setSelectedStudentToAdd(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر طالباً للإضافة...</option>
                {students.filter(s => !viewGroup.studentIds.includes(s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.name} - {s.parentPhone}</option>
                ))}
              </select>
              <input type="number" placeholder="دفع دلوقتي" min="0"
                value={paymentAmountToAdd} onChange={e => setPaymentAmountToAdd(e.target.value === '' ? '' : +e.target.value)}
                className="w-full sm:w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <button disabled={task.pending || !can('groups', 'edit') || !selectedStudentToAdd} onClick={() => addStudentToGroup(viewGroup.id, selectedStudentToAdd)}
                className="px-4 py-2 text-white rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
                إضافة
              </button>
            </div>
            {selectedStudentToAdd && (() => {
              const vc = courses.find(c => c.id === viewGroup.courseId);
              const n = resolveSessionsPerMonth({
                courseSessionsPerMonth: vc?.sessionsPerMonth,
                settingSessionsPerMonth: settings?.sessionsPerMonth,
              });
              return (
                <SessionPicker
                  size="sm"
                  sessions={n}
                  value={startSessionToAdd}
                  onChange={setStartSessionToAdd}
                />
              );
            })()}
          </div>
          <div className="space-y-2">
            {viewGroup.studentIds.length === 0 ? (
              <p className="text-center text-gray-400 py-6">لا يوجد طلاب في هذه المجموعة</p>
            ) : viewGroup.studentIds.map(sid => {
              const student = students.find(s => s.id === sid);
              if (!student) return null;
              return (
                <div key={sid} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 cursor-pointer group" onClick={() => navigate(`/students/${sid}`)} title="عرض ملف الطالب">
                    <span className="text-xl">{student.gender === 'male' ? '👦' : '👧'}</span>
                    <div>
                      <p className="text-sm font-semibold group-hover:text-indigo-600 group-hover:underline transition-colors">{student.name}</p>
                      <p className="text-xs text-gray-500">{student.parentPhone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button disabled={!can('payments', 'create') || task.pending} onClick={() => setRenewTarget({ studentId: sid, studentName: student.name, groupId: viewGroup.id })}
                      className="text-xs text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors" title="تجديد / استكمال الاشتراك">
                      تجديد
                    </button>
                    <button disabled={!can('students', 'edit') || task.pending} onClick={() => setTransferTarget({ studentId: sid, studentName: student.name, fromGroupId: viewGroup.id })}
                      className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">
                      تحويل
                    </button>
                    <button disabled={task.pending || !can('groups', 'edit')} onClick={() => removeStudentFromGroup(viewGroup.id, sid)}
                      className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                      إزالة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* تجديد / استكمال اشتراك طالب في نفس المجموعة */}
      {renewTarget && (
        <RenewDialog
          open={!!renewTarget}
          studentId={renewTarget.studentId}
          studentName={renewTarget.studentName}
          groupId={renewTarget.groupId}
          onClose={() => setRenewTarget(null)}
          onDone={() => load()}
        />
      )}

      {/* تحويل طالب لمجموعة/مدرس آخر */}
      {transferTarget && (
        <TransferDialog
          open={!!transferTarget}
          studentId={transferTarget.studentId}
          studentName={transferTarget.studentName}
          fromGroupId={transferTarget.fromGroupId}
          groups={groups}
          courses={courses}
          teachers={teachers}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            load();
            setViewGroup(null);
          }}
        />
      )}

      <ConfirmDialog isOpen={!!deleteId} title="حذف المجموعة" message="هل أنت متأكد؟ سيتم إلغاء تسجيل جميع الطلاب من هذه المجموعة وإعادة حساب مستحقاتهم."
        onConfirm={async () => {
          if (!deleteId) return;
          await task.run(async () => {
            await deleteCatalogRecord(user, 'groups', deleteId);
            notify.success('تم الحذف');
            await load();
          });
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
