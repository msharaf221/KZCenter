import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import { dbGetAll, dbPut, dbSoftDelete, dbAdd, generateId, recalculateStudentTotalPaid, syncGroupStatus, Group, Course, Teacher, Student, GroupStatus, ScheduleItem } from '../lib/db';
// Utils imported as needed
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';

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
  const navigate = useNavigate();
  const { settings } = useApp();
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewGroup, setViewGroup] = useState<Group | null>(null);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [paymentAmountToAdd, setPaymentAmountToAdd] = useState<number | ''>('');
  const [form, setForm] = useState({
    name: '', courseId: '', levelId: '', teacherId: '',
    maxStudents: 20, status: 'open' as GroupStatus,
    schedule: [{ days: [], startTime: '09:00', endTime: '10:00', room: '' }] as ScheduleItem[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, c, t, s] = await Promise.all([
        dbGetAll<Group>('groups'),
        dbGetAll<Course>('courses'),
        dbGetAll<Teacher>('teachers'),
        dbGetAll<Student>('students'),
      ]);
      const activeStudentIds = new Set(s.filter(st => !st.deleted).map(st => st.id));
      const cleanedGroups = g.map(gr => {
        const originalCount = gr.studentIds.length;
        gr.studentIds = gr.studentIds.filter(id => activeStudentIds.has(id));
        if (gr.studentIds.length !== originalCount) {
          dbPut('groups', gr).catch(console.error);
        }
        return gr;
      });

      setGroups(cleanedGroups.filter(gr => !search || gr.name.toLowerCase().includes(search.toLowerCase())));
      setCourses(c);
      setTeachers(t);
      setStudents(s);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

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
    if (!form.name.trim()) { notify.error('اسم المجموعة مطلوب'); return; }
    if (!form.courseId) { notify.error('اختر كورساً'); return; }
    if (!form.teacherId) { notify.error('اختر مدرساً'); return; }
    try {
      if (editing) {
        await dbPut('groups', { ...editing, ...form, updatedAt: new Date().toISOString() });
        notify.success('تم تحديث المجموعة');
      } else {
        await dbAdd('groups', { id: generateId(), ...form, studentIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        notify.success('تم إضافة المجموعة');
      }
      setShowModal(false);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function removeStudentFromGroup(groupId: string, studentId: string) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const updatedIds = group.studentIds.filter(id => id !== studentId);
    await dbPut('groups', { ...group, studentIds: updatedIds, updatedAt: new Date().toISOString() });
    await syncGroupStatus(groupId);
    // Update student's enrolledGroups
    const student = students.find(s => s.id === studentId);
    if (student) {
      await dbPut('students', { ...student, enrolledGroups: student.enrolledGroups.filter(g => g !== groupId), updatedAt: new Date().toISOString() });
      await recalculateStudentTotalPaid(studentId);
    }
    notify.success('تم إزالة الطالب من المجموعة');
    load();
    if (viewGroup) setViewGroup({ ...group, studentIds: updatedIds });
  }

  async function addStudentToGroup(groupId: string, studentId: string) {
    if (!studentId) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    if (group.studentIds.length >= group.maxStudents) {
      notify.error('المجموعة مكتملة');
      return;
    }

    if (group.status === 'ended') {
      notify.error('لا يمكن التسجيل في مجموعة منتهية');
      return;
    }

    if (group.studentIds.includes(studentId)) {
      notify.error('الطالب موجود بالفعل في المجموعة');
      return;
    }

    const updatedIds = [...group.studentIds, studentId];
    await dbPut('groups', { ...group, studentIds: updatedIds, updatedAt: new Date().toISOString() });
    await syncGroupStatus(groupId);
    
    const student = students.find(s => s.id === studentId);
    if (student) {
      await dbPut('students', { ...student, enrolledGroups: [...new Set([...student.enrolledGroups, groupId])], updatedAt: new Date().toISOString() });
      
      if (paymentAmountToAdd && paymentAmountToAdd > 0) {
        const paymentId = generateId();
        await dbAdd('payments', {
          id: paymentId,
          studentId: studentId,
          courseId: group.courseId,
          amount: Number(paymentAmountToAdd),
          date: new Date().toISOString().split('T')[0],
          type: 'subscription',
          status: 'paid',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      await recalculateStudentTotalPaid(studentId);
    }
    
    notify.success('تم إضافة الطالب إلى المجموعة');
    load();
    if (viewGroup) setViewGroup({ ...group, studentIds: updatedIds });
    setSelectedStudentToAdd('');
    setPaymentAmountToAdd('');
  }

  const selectedCourse = courses.find(c => c.id === form.courseId);
  const fillPercent = (group: Group) => group.maxStudents > 0 ? Math.round((group.studentIds.length / group.maxStudents) * 100) : 0;

  return (
    <Layout title="إدارة المجموعات">
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم..."
              className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            <Plus size={16} /> إضافة مجموعة
          </button>
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
                    <button onClick={() => openEdit(group)} className="flex-1 py-1.5 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors">تعديل</button>
                    <button onClick={() => setDeleteId(group.id)} className="flex-1 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">حذف</button>
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
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="مثال: الرياضيات - المجموعة أ" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الكورس *</label>
              <select value={form.courseId} onChange={e => setForm({...form, courseId: e.target.value, levelId: ''})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر كورساً</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المستوى</label>
              <select value={form.levelId} onChange={e => setForm({...form, levelId: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر مستوى</option>
                {selectedCourse?.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المدرس *</label>
              <select value={form.teacherId} onChange={e => setForm({...form, teacherId: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">اختر مدرساً</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الحد الأقصى للطلاب</label>
              <input type="number" min={1} max={50} value={form.maxStudents} onChange={e => setForm({...form, maxStudents: +e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value as GroupStatus})}
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
                      style={sched.days.includes(d.key) ? { backgroundColor: settings?.primaryColor || '#6366f1' } : {}}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">من</label>
                    <input type="time" value={sched.startTime}
                      onChange={e => { const sc = [...form.schedule]; sc[idx] = {...sc[idx], startTime: e.target.value}; setForm({...form, schedule: sc}); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">إلى</label>
                    <input type="time" value={sched.endTime}
                      onChange={e => { const sc = [...form.schedule]; sc[idx] = {...sc[idx], endTime: e.target.value}; setForm({...form, schedule: sc}); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">القاعة</label>
                    <input type="text" value={sched.room || ''} placeholder="رقم القاعة"
                      onChange={e => { const sc = [...form.schedule]; sc[idx] = {...sc[idx], room: e.target.value}; setForm({...form, schedule: sc}); }}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            {editing ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      {/* View Students Modal */}
      {viewGroup && (
        <Modal isOpen={!!viewGroup} onClose={() => { setViewGroup(null); setSelectedStudentToAdd(''); setPaymentAmountToAdd(''); }} title={`طلاب مجموعة: ${viewGroup.name}`} size="md">
          <div className="mb-4 flex flex-col sm:flex-row gap-2">
            <select value={selectedStudentToAdd} onChange={e => setSelectedStudentToAdd(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="">اختر طالباً للإضافة...</option>
              {students.filter(s => !viewGroup.studentIds.includes(s.id)).map(s => (
                <option key={s.id} value={s.id}>{s.name} - {s.parentPhone}</option>
              ))}
            </select>
            <input type="number" placeholder="المبلغ المدفوع (اختياري)" min="0"
              value={paymentAmountToAdd} onChange={e => setPaymentAmountToAdd(e.target.value === '' ? '' : +e.target.value)}
              className="w-full sm:w-1/3 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            <button onClick={() => addStudentToGroup(viewGroup.id, selectedStudentToAdd)}
              className="px-4 py-2 text-white rounded-xl text-sm font-medium transition-colors"
              style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
              إضافة
            </button>
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
                  <button onClick={() => removeStudentFromGroup(viewGroup.id, sid)}
                    className="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors">
                    إزالة
                  </button>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      <ConfirmDialog isOpen={!!deleteId} title="حذف المجموعة" message="هل أنت متأكد؟ سيتم إلغاء تسجيل جميع الطلاب من هذه المجموعة وإعادة حساب مستحقاتهم."
        onConfirm={async () => {
          if (deleteId) {
            const group = groups.find(g => g.id === deleteId);
            // Cascade: إزالة المجموعة من enrolledGroups لكل الطلاب + إعادة حساب المستحقات
            if (group) {
              const enrolledStudents = students.filter(s => s.enrolledGroups?.includes(deleteId));
              for (const st of enrolledStudents) {
                await dbPut('students', {
                  ...st,
                  enrolledGroups: st.enrolledGroups.filter(gid => gid !== deleteId),
                  updatedAt: new Date().toISOString(),
                });
                await recalculateStudentTotalPaid(st.id);
              }
            }
            await dbSoftDelete('groups', deleteId);
            notify.success('تم الحذف');
            load();
          }
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
