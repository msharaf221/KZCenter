import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { dbGetAll, dbPut, dbSoftDelete, dbAdd, generateId, recalculateStudentTotalPaid, Course, CourseLevel, Group, Student } from '../lib/db';
import { formatCurrency, COLORS, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';

const EMOJIS = ['📚', '🔢', '🔬', '💻', '🎨', '🎵', '🌍', '⚽', '🧪', '📖', '✏️', '🎯'];
const CATEGORIES = ['علوم', 'رياضيات', 'لغات', 'حاسوب', 'فنون', 'رياضة', 'أخرى'];

export default function CoursesPage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    name: '', category: 'علوم', description: '', price: 0,
    durationMonths: 3, icon: '📚', color: COLORS[0], levels: [] as CourseLevel[],
  });
  const [newLevelName, setNewLevelName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allCourses = await dbGetAll<Course>('courses');
      const filtered = search
        ? allCourses.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        : allCourses;
      setCourses(filtered);
      const groups = await dbGetAll<Group>('groups');
      const gc: Record<string, number> = {};
      const sc: Record<string, number> = {};
      groups.forEach(g => {
        gc[g.courseId] = (gc[g.courseId] || 0) + 1;
        sc[g.courseId] = (sc[g.courseId] || 0) + g.studentIds.length;
      });
      setGroupCounts(gc);
      setStudentCounts(sc);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ name: '', category: 'علوم', description: '', price: 0, durationMonths: 3, icon: '📚', color: COLORS[0], levels: [] });
    setShowModal(true);
  }

  function openEdit(c: Course) {
    setEditing(c);
    setForm({ name: c.name, category: c.category, description: c.description || '', price: c.price, durationMonths: c.durationMonths, icon: c.icon, color: c.color, levels: [...c.levels] });
    setShowModal(true);
  }

  function addLevel() {
    if (!newLevelName.trim()) return;
    const level: CourseLevel = { id: generateId(), name: newLevelName.trim(), order: form.levels.length + 1 };
    setForm(f => ({ ...f, levels: [...f.levels, level] }));
    setNewLevelName('');
  }

  function removeLevel(id: string) {
    setForm(f => ({ ...f, levels: f.levels.filter(l => l.id !== id) }));
  }

  async function handleSave() {
    if (!form.name.trim()) { notify.error('اسم الكورس مطلوب'); return; }
    try {
      const courseId = editing?.id || generateId();
      if (editing) {
        const priceChanged = editing.price !== form.price;
        await dbPut('courses', { ...editing, ...form, updatedAt: new Date().toISOString() });
        notify.success('تم تحديث الكورس');
        addAuditEntry({
          userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
          action: 'update', entity: 'course', entityId: courseId,
          details: `تعديل الكورس: ${form.name}`,
        });

        // عند تغيير السعر: إعادة حساب مستحقات كل الطلاب المسجلين في مجموعات هذا الكورس
        if (priceChanged) {
          const allGroups = await dbGetAll<Group>('groups');
          const courseGroupIds = new Set(allGroups.filter(g => g.courseId === editing.id).map(g => g.id));
          if (courseGroupIds.size > 0) {
            const allStudents = await dbGetAll<Student>('students');
            const affected = allStudents.filter(s => s.enrolledGroups?.some(gid => courseGroupIds.has(gid)));
            for (const st of affected) {
              await recalculateStudentTotalPaid(st.id);
            }
            if (affected.length > 0) {
              notify.info(`تم تحديث مستحقات ${affected.length} طالب بالسعر الجديد`);
            }
          }
        }
      } else {
        await dbAdd('courses', { id: courseId, ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        notify.success('تم إضافة الكورس');
        addAuditEntry({
          userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
          action: 'create', entity: 'course', entityId: courseId,
          details: `إضافة كورس: ${form.name}`,
        });
      }
      setShowModal(false);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  return (
    <Layout title="إدارة الكورسات">
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
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            <Plus size={16} /> إضافة كورس
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map(course => (
              <div key={course.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-2" style={{ backgroundColor: course.color }} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{course.icon}</span>
                      <div>
                        <h3 className="font-bold text-gray-900">{course.name}</h3>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{course.category}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(course)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteId(course.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {course.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{course.description}</p>}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-base font-bold text-gray-900">{groupCounts[course.id] || 0}</p>
                      <p className="text-xs text-gray-500">مجموعة</p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-base font-bold text-gray-900">{studentCounts[course.id] || 0}</p>
                      <p className="text-xs text-gray-500">طالب</p>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-base font-bold text-green-600">{formatCurrency(course.price, settings?.currency)}</p>
                      <p className="text-xs text-gray-500">شهرياً</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{course.category}</span>
                    <span className="text-xs text-gray-500">{course.levels.length} مستويات</span>
                  </div>
                  {course.levels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {course.levels.map(l => (
                        <span key={l.id} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{l.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {courses.length === 0 && <div className="col-span-3 text-center py-12 text-gray-400">لا توجد كورسات</div>}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل الكورس' : 'إضافة كورس جديد'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الكورس *</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التصنيف</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">السعر الشهري</label>
              <input type="number" min={0} value={form.price} onChange={e => setForm({...form, price: +e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <p className="text-[11px] text-gray-400 mt-1">الطالب بيتحاسب شهر بشهر — ده المبلغ المطلوب منه كل شهر</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الأيقونة</label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setForm({...form, icon: e})}
                    className={`text-xl p-1 rounded-lg border-2 ${form.icon === e ? 'border-indigo-500' : 'border-transparent'}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">اللون</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm({...form, color: c})}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">الوصف</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none" />
            </div>
          </div>

          {/* Levels */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">المستويات</label>
            <div className="flex gap-2 mb-2">
              <input type="text" value={newLevelName} onChange={e => setNewLevelName(e.target.value)}
                placeholder="اسم المستوى (مثال: تمهيدي)"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                onKeyDown={e => e.key === 'Enter' && addLevel()} />
              <button onClick={addLevel} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">إضافة</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.levels.map(l => (
                <span key={l.id} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm">
                  {l.name}
                  <button onClick={() => removeLevel(l.id)} className="text-indigo-400 hover:text-indigo-700">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            {editing ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف الكورس" message="هل أنت متأكد؟"
        onConfirm={async () => {
          if (deleteId) {
            // حماية: منع حذف كورس مرتبط بمجموعات نشطة
            const allGroups = await dbGetAll<Group>('groups');
            const linkedGroups = allGroups.filter(g => g.courseId === deleteId && !g.deleted);
            if (linkedGroups.length > 0) {
              notify.error(`لا يمكن حذف الكورس - مرتبط بـ ${linkedGroups.length} مجموعة. احذف المجموعات أولاً`);
            } else {
              await dbSoftDelete('courses', deleteId);
              addAuditEntry({
                userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
                action: 'delete', entity: 'course', entityId: deleteId,
                details: `حذف كورس: ${courses.find(c => c.id === deleteId)?.name || deleteId}`,
              });
              notify.success('تم الحذف');
              load();
            }
          }
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
