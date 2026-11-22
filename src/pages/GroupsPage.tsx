import { Plus, Search, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import RenewDialog from '../components/RenewDialog';
import TransferDialog from '../components/TransferDialog';
import GroupStudentsDialog from '../features/groups/GroupStudentsDialog';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { Group, GroupStatus, ScheduleItem } from '../domain/models';
import { useCommandTask } from '../hooks/useCommandTask';
import { usePageResource } from '../hooks/usePageResource';
import { notify } from '../lib/notifications';
import { getAllSubjects, getSubject } from '../lib/subjects';
import type { SubjectId } from '../domain/subject';
import { getContrastColor, formatCurrency } from '../lib/utils';
import { deleteCatalogRecord, saveGroup } from '../services/commands/catalog';
import { enrollGroupStudents, removeGroupStudent } from '../services/commands/studentFinance';
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
  const { settings } = useApp();
  const { user, can } = useAuth();
  const canWrite = can('groups', 'create') || can('groups', 'edit');
  const canDelete = can('groups', 'delete');
  const canEnroll = can('groups', 'enroll');
  const [search, setSearch] = useState('');
  /** فلتر بالمادة ('' = الكل) */
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | ''>('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewGroup, setViewGroup] = useState<Group | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ groupId: string; studentId: string; studentName: string } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ studentId: string; studentName: string; fromGroupId: string } | null>(null);
  const [renewTarget, setRenewTarget] = useState<{ studentId: string; studentName: string; groupId: string } | null>(null);
  const [form, setForm] = useState({
    name: '', courseId: '', levelId: '', teacherId: '',
    maxStudents: 20, status: 'open' as GroupStatus,
    price: '' as number | '',
    schedule: [{ days: [], startTime: '09:00', endTime: '10:00', room: '' }] as ScheduleItem[],
  });

  const query = useCallback(() => loadGroupsCatalog({ search, subjectFilter, role: user?.role, teacherId: user?.teacherId }), [search, subjectFilter, user?.role, user?.teacherId]);
  const { data: { groups, courses, teachers, students }, loading, reload: load, error } = usePageResource(query, {
    groups: [], courses: [], teachers: [], students: [],
  });

  function openAdd() {
    setEditing(null);
    setForm({ name: '', courseId: courses[0]?.id || '', levelId: '', teacherId: teachers[0]?.id || '', maxStudents: 20, status: 'open', price: '', schedule: [{ days: [], startTime: '09:00', endTime: '10:00', room: '' }] });
    setShowModal(true);
  }

  function openEdit(g: Group) {
    setEditing(g);
    setForm({ name: g.name, courseId: g.courseId, levelId: g.levelId || '', teacherId: g.teacherId, maxStudents: g.maxStudents, status: g.status, price: typeof g.price === 'number' ? g.price : '', schedule: [...g.schedule] });
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
      const priceVal = form.price === '' ? null : Number(form.price);
      await saveGroup(user, { ...form, price: priceVal }, editing?.id);
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
  async function addStudentsToGroup(groupId: string, ids: string[], startSession: number): Promise<boolean> {
    const result = await task.run(async () => {
      const enrollment = await enrollGroupStudents(user, ids, groupId, { startSession });
      notify.success(`تم تسجيل ${enrollment.enrolledCount || ids.length} طالب في المجموعة`);
      await refreshViewedGroup(groupId);
      return true;
    });
    return result ?? false;
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
            {getAllSubjects(settings?.customSubjects).map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
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
                        const subject = getSubject(group.subjectId ?? course?.subjectId, settings?.customSubjects);
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
                  <div className="flex items-center justify-between text-xs mb-2">
                    <p className="text-gray-600">👨‍🏫 {teacher?.name || 'غير محدد'}</p>
                    {typeof group.price === 'number' ? (
                      <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg text-[11px]" title="سعر شهري خاص بهذه المجموعة">
                        {formatCurrency(group.price, settings?.currency)} <span className="text-[10px] font-normal">(خاص)</span>
                      </span>
                    ) : (
                      <span className="text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg text-[11px]" title="سعر موروث من الكورس">
                        {formatCurrency(course?.price || 0, settings?.currency)} <span className="text-[10px] text-gray-400">(موروث)</span>
                      </span>
                    )}
                  </div>

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
                    {c.icon} {c.name}{c.subjectId ? ` — ${getSubject(c.subjectId, settings?.customSubjects)?.name || c.subjectId} (${c.price})` : ''}
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
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-gray-700">السعر الشهري للمجموعة (اختياري)</label>
                {form.price !== '' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                      سعر خاص بالمجموعة
                    </span>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, price: '' }))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      استعادة سعر الكورس
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">
                    موروث من الكورس {selectedCourse ? `(${formatCurrency(selectedCourse.price, settings?.currency)})` : ''}
                  </span>
                )}
              </div>
              <input
                type="number"
                min={0}
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value === '' ? '' : Math.max(0, +e.target.value) })}
                placeholder={selectedCourse ? `موروث من الكورس (${selectedCourse.price} ${settings?.currency || 'EGP'})` : 'موروث من الكورس'}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                اترك الحقل فارغاً لترث المجموعة سعر الكورس تلقائياً. إدخال 0 يعني مجموعة مجانية. تعديل السعر يؤثر على التسجيلات والتجديدات الجديدة فقط.
              </p>
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

      {viewGroup && (
        <GroupStudentsDialog
          group={viewGroup}
          courses={courses}
          students={students}
          settings={settings}
          canEnroll={canEnroll}
          canRenew={can('payments', 'create')}
          canTransfer={can('students', 'edit') && canEnroll}
          pending={task.pending}
          onClose={() => { setViewGroup(null); setRemoveTarget(null); }}
          onEnroll={addStudentsToGroup}
          onRenew={(student, groupId) => setRenewTarget({ studentId: student.id, studentName: student.name, groupId })}
          onTransfer={(student, fromGroupId) => setTransferTarget({ studentId: student.id, studentName: student.name, fromGroupId })}
          onRemove={(student, groupId) => setRemoveTarget({ groupId, studentId: student.id, studentName: student.name })}
        />
      )}

      <ConfirmDialog
        isOpen={!!removeTarget}
        title="إزالة الطالب من المجموعة"
        message={removeTarget ? `هل تريد إزالة ${removeTarget.studentName}؟ سيبقى الطالب في المركز، وتظل الدفعات المسجلة في سجله، ويُلغى المتبقي من أقساط هذه المجموعة غير المسددة أو المسددة جزئيًا.` : ''}
        confirmLabel="نعم، إزالة"
        danger
        onConfirm={() => {
          if (!removeTarget) return;
          const target = removeTarget;
          setRemoveTarget(null);
          void removeStudentFromGroup(target.groupId, target.studentId);
        }}
        onCancel={() => setRemoveTarget(null)}
      />

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
