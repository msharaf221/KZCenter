import { BookOpen, Edit2, Plus, Search, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import SubjectsManagementModal from '../components/subjects/SubjectsManagementModal';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { Course, CourseLevel } from '../domain/models';
import { useCommandTask } from '../hooks/useCommandTask';
import { usePageResource } from '../hooks/usePageResource';
import { generateId } from '../lib/ids';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { getAllSubjects, getSubject, getSubjectCategories, type SubjectId } from '../lib/subjects';
import { syncSubjects, type SubjectSyncReport } from '../lib/subjectSync';
import { COLORS, formatCurrency, getContrastColor } from '../lib/utils';
import { deleteCatalogRecord, saveCourse } from '../services/commands/catalog';
import { loadCoursesCatalog } from '../services/queries/courses';

const EMOJIS = ['📚', '🔢', '🔬', '💻', '🎨', '🎵', '🌍', '⚽', '🧪', '📖', '✏️', '🎯', '🧮', '🕌'];

export default function CoursesPage() {
  const task = useCommandTask();
  const { settings } = useApp();
  const { user, can } = useAuth();
  const canWrite = can('courses', 'create') || can('courses', 'edit');
  const canDelete = can('courses', 'delete');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSubjectsModal, setShowSubjectsModal] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', category: 'علوم', description: '', price: 0,
    subjectId: undefined as SubjectId | undefined,
    durationMonths: 3, sessionsPerMonth: undefined as number | undefined, icon: '📚', color: COLORS[0], levels: [] as CourseLevel[],
  });
  const [newLevelName, setNewLevelName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<SubjectSyncReport | null>(null);

  const categories = [...new Set([...getSubjectCategories(settings?.customSubjects), 'علوم', 'لغات', 'رياضيات', 'حاسوب', 'فنون', 'رياضة', 'أخرى'])];

  const query = useCallback(() => loadCoursesCatalog({ search }), [search]);
  const { data: { courses, groupCounts, studentCounts }, loading, reload: load, error } = usePageResource(query, {
    courses: [], groupCounts: {}, studentCounts: {},
  });

  function openAdd() {
    setEditing(null);
    setForm({ name: '', category: 'علوم', description: '', price: 0, subjectId: undefined, durationMonths: 3, sessionsPerMonth: undefined, icon: '📚', color: COLORS[0], levels: [] });
    setShowModal(true);
  }

  function openEdit(c: Course) {
    setEditing(c);
    setForm({ name: c.name, category: c.category, description: c.description || '', price: c.price, subjectId: c.subjectId, durationMonths: c.durationMonths, sessionsPerMonth: c.sessionsPerMonth, icon: c.icon, color: c.color, levels: [...c.levels] });
    setShowModal(true);
  }

  /**
   * اختيار المادة لربط الكورس بها لأغراض الفلاتر والتصنيف والتقارير.
   * المادة لا تحدد السعر، فلكل كورس سعره المستقل القابل للإضافة والتعديل.
   */
  function pickSubject(id: SubjectId | undefined) {
    if (!id) { setForm(f => ({ ...f, subjectId: undefined })); return; }
    const subject = getSubject(id, settings?.customSubjects);
    if (!subject) {
      setForm(f => ({ ...f, subjectId: id }));
      return;
    }
    setForm(f => ({
      ...f,
      subjectId: id,
      category: f.category && f.category !== 'علوم' ? f.category : subject.category,
      icon: f.icon === '📚' ? subject.icon : f.icon,
      color: f.color === COLORS[0] ? subject.color : f.color,
      name: f.name.trim() ? f.name : subject.name,
    }));
  }

  /** ظبط ربط الكورسات والمجموعات والمدرسين بالمواد للتصنيف دون المساس بالأسعار */
  async function handleSyncSubjects() {
    setSyncing(true);
    try {
      const report = await syncSubjects({ applyPrices: false, updateUnpaidInstallments: false });
      setSyncReport(report);
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'update', entity: 'course', entityId: 'subjects-sync',
        details: `ظبط تصنيف المواد: ${report.coursesLinked} كورس اترابط، ${report.groupsLinked} مجموعة، ${report.teachersLinked} مدرس`,
      });
      notify.success(
        `تم ظبط المواد: ${report.coursesCreated} كورس جديد · ${report.coursesLinked} اترابط بمادته · ` +
        `${report.groupsLinked} مجموعة · ${report.teachersLinked} مدرس`
      );
      load();
    } catch {
      notify.error('حصل خطأ أثناء ظبط المواد');
    } finally {
      setSyncing(false);
    }
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
    await task.run(async () => {
      const result = await saveCourse(user, form, editing?.id);
      notify.success(editing ? 'تم تحديث الكورس' : 'تمت الإضافة بنجاح');
      if (result.recalculated) notify.info(`تم تحديث مستحقات ${result.recalculated} طالب بالسعر الجديد`);
      setShowModal(false);
      await load();
    });
  }

  if (error) return <PageReadError title="الكورسات" onRetry={load} />;

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
          <button onClick={() => setShowSubjectsModal(true)}
            title="إدارة وإضافة وتعديل المواد الدراسية"
            className="flex items-center gap-2 px-4 py-2.5 border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold transition-colors">
            <BookOpen size={16} />
            <span>إدارة المواد</span>
            <span className="text-[11px] bg-indigo-200/80 text-indigo-800 px-1.5 py-0.5 rounded-full font-bold">
              {getAllSubjects(settings?.customSubjects).length}
            </span>
          </button>
          <button onClick={handleSyncSubjects} disabled={syncing}
            title="يربط كل كورس ومجموعة ومدرس بمادته لأغراض التصنيف والتقارير دون تعديل الأسعار"
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Wand2 size={16} /> {syncing ? 'جاري الظبط…' : 'ظبط تصنيف المواد'}
          </button>
          {canWrite && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
              style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
              <Plus size={16} /> إضافة كورس
            </button>
          )}
        </div>

        {syncReport && (
          <div className="text-xs text-gray-600 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 space-y-1">
            <div>
              تم تصنيف المواد: {syncReport.coursesCreated} كورس جديد · {syncReport.coursesLinked} اترابط بمادته — مجموعات: {syncReport.groupsLinked} · مدرسين: {syncReport.teachersLinked}
            </div>
            {syncReport.coursesUnmatched.length > 0 && (
              <div className="text-amber-800">
                محتاج ربط يدوي ({syncReport.coursesUnmatched.length}): {syncReport.coursesUnmatched.slice(0, 8).join('، ')}
              </div>
            )}
          </div>
        )}

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
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{course.category}</span>
                          {course.subjectId && getSubject(course.subjectId, settings?.customSubjects) ? (
                            <span className="text-xs px-2 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: getSubject(course.subjectId, settings?.customSubjects)?.color || '#6366f1' }}>
                              {getSubject(course.subjectId, settings?.customSubjects)?.icon} {getSubject(course.subjectId, settings?.customSubjects)?.name}
                            </span>
                          ) : (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">بدون مادة</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {canWrite && <button onClick={() => openEdit(course)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600"><Edit2 size={14} /></button>}
                      {canDelete && <button onClick={() => setDeleteId(course.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>}
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
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-gray-700">المادة</label>
                <button
                  type="button"
                  onClick={() => setShowSubjectsModal(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  + إدارة وإضافة مادة
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <select value={form.subjectId ?? ''} onChange={e => pickSubject((e.target.value || undefined) as SubjectId | undefined)}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                  <option value="">— بدون مادة (تصنيف عام) —</option>
                  {getAllSubjects(settings?.customSubjects).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.icon} {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                تُستخدم المادة لربط الكورس بالتصنيف والفلاتر والتقارير. السعر مستقل ويُحدد للكورس مباشرة.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التصنيف</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">السعر الشهري (ج.م) *</label>
              <input type="number" min={0} value={form.price} onChange={e => setForm({ ...form, price: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <p className="text-[11px] text-gray-400 mt-1">
                المبلغ المطلوب لكل شهر. تغيير السعر يسري على التسجيلات والتجديدات الجديدة فقط ولا يغيّر الأقساط السابقة.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">عدد الحصص في الشهر</label>
              <input type="number" min={1} max={40} placeholder="8"
                value={form.sessionsPerMonth ?? ''}
                onChange={e => setForm({ ...form, sessionsPerMonth: e.target.value === '' ? undefined : Math.max(1, +e.target.value) })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
              <p className="text-[11px] text-gray-400 mt-1">
                {form.price > 0 && form.sessionsPerMonth
                  ? <>الحصة = <strong>{formatCurrency(Math.round((form.price / form.sessionsPerMonth) * 100) / 100, settings?.currency)}</strong> — للي بييجي في نص الشهر</>
                  : 'سيبها فاضية = 8 حصص في الشهر (أو الافتراضي من الإعدادات)'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الأيقونة</label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setForm({ ...form, icon: e })}
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
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">الوصف</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
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
          <button onClick={handleSave} disabled={task.pending} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            {editing ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف الكورس" message="هل أنت متأكد؟"
        onConfirm={async () => {
          if (!deleteId) return;
          await task.run(async () => {
            await deleteCatalogRecord(user, 'courses', deleteId);
            notify.success('تم الحذف');
            await load();
          });
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />

      <SubjectsManagementModal
        isOpen={showSubjectsModal}
        onClose={() => setShowSubjectsModal(false)}
        courses={courses}
        onSubjectCreated={newId => pickSubject(newId)}
      />
    </Layout>
  );
}
