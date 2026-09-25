import { Plus, Search, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import TeacherPayFields from '../components/TeacherPayFields';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { Teacher, TeacherStatus } from '../domain/models';
import { describeTeacherPay } from '../domain/payroll/settings';
import { useCommandTask } from '../hooks/useCommandTask';
import { usePageResource } from '../hooks/usePageResource';
import { notify } from '../lib/notifications';
import { SUBJECTS, getSubject, type SubjectId } from '../lib/subjects';
import { getContrastColor } from '../lib/utils';
import { deleteCatalogRecord, saveTeacher } from '../services/commands/catalog';
import { loadTeachersList } from '../services/queries/teachers';

const PAGE_SIZE = 20;

const INITIAL_FORM: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', specialization: '', subjectIds: [], phone: '', email: '',
  salary: 0, payModel: 'subscription_percentage', payRate: undefined, payNotes: '',
  status: 'active', avatar: '', notes: '',
};

export default function TeachersPage() {
  const task = useCommandTask();
  const navigate = useNavigate();
  const { settings } = useApp();
  const { user, can } = useAuth();
  const canWrite = can('teachers', 'create') || can('teachers', 'edit');
  const canDelete = can('teachers', 'delete');
  const showMoney = can('payroll', 'view');
  const canManagePay = can('payroll', 'edit');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState<Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>>(INITIAL_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const query = useCallback(() => loadTeachersList({ page, pageSize: PAGE_SIZE, search }), [page, search]);
  const { data: { teachers, total, groupCounts, studentCounts }, loading, reload: loadTeachers, error } = usePageResource(query, {
    teachers: [], total: 0, groupCounts: {}, studentCounts: {},
  });
  useEffect(() => { setPage(1); }, [search]);

  function openAdd() {
    setEditingTeacher(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  }

  function openEdit(t: Teacher) {
    setEditingTeacher(t);
    setForm({ name: t.name, specialization: t.specialization, subjectIds: t.subjectIds || [], phone: t.phone, email: t.email || '', salary: t.salary, payModel: t.payModel || 'fixed', payRate: t.payRate, payNotes: t.payNotes || '', status: t.status, avatar: t.avatar || '', notes: t.notes || '' });
    setShowModal(true);
  }

  async function handleSave() {
    await task.run(async () => {
      const payChanged = !editingTeacher || form.salary !== editingTeacher.salary
        || (form.payModel || 'fixed') !== (editingTeacher.payModel || 'fixed')
        || form.payRate !== editingTeacher.payRate || (form.payNotes || '') !== (editingTeacher.payNotes || '');
      await saveTeacher(user, form, editingTeacher?.id, payChanged);
      notify.success(editingTeacher ? 'تم تحديث بيانات المدرس' : 'تمت الإضافة بنجاح');

      setShowModal(false);
      await loadTeachers();
    });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (error) return <PageReadError title="المدرسون" onRetry={loadTeachers} />;

  return (
    <Layout title="إدارة المدرسين">
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو التخصص..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {showMoney && (
              <button onClick={() => navigate('/payroll')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                <Wallet size={16} /> مرتبات المدرسين
              </button>
            )}
            {canWrite && (
              <button onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
                style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
                <Plus size={16} /> إضافة مدرس
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teachers.map(teacher => (
              <div key={teacher.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-2xl">
                      👨‍🏫
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{teacher.name}</h3>
                      <p className="text-xs text-gray-500">{teacher.specialization}</p>
                      {(teacher.subjectIds || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(teacher.subjectIds || []).map(id => {
                            const subject = getSubject(id);
                            if (!subject) return null;
                            return (
                              <span key={id} className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: subject.color }}>
                                {subject.icon} {subject.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge status={teacher.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-2 bg-gray-50 rounded-lg text-center">
                    <p className="text-lg font-bold text-gray-900">{groupCounts[teacher.id] || 0}</p>
                    <p className="text-xs text-gray-500">مجموعة</p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded-lg text-center">
                    <p className="text-lg font-bold text-gray-900">{studentCounts[teacher.id] || 0}</p>
                    <p className="text-xs text-gray-500">طالب</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  <p>📱 {teacher.phone}</p>
                  {teacher.email && <p>📧 {teacher.email}</p>}
                  {showMoney && <p className="text-green-600 font-medium mt-1">💰 {describeTeacherPay(teacher, settings?.currency)}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/teachers/${teacher.id}`)} className="flex-1 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">عرض</button>
                  {canWrite && <button onClick={() => openEdit(teacher)} className="flex-1 py-1.5 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors">تعديل</button>}
                  {canDelete && <button onClick={() => setDeleteId(teacher.id)} className="flex-1 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">حذف</button>}
                </div>
              </div>
            ))}
            {teachers.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-400">لا يوجد مدرسون</div>
            )}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingTeacher ? 'تعديل بيانات المدرس' : 'إضافة مدرس جديد'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">الاسم الكامل *</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="اسم المدرس" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">التخصص *</label>
            <input type="text" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="مثال: رياضيات، لغة عربية" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">المواد اللي بيدرّسها</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map(s => {
                const active = (form.subjectIds || []).includes(s.id);
                return (
                  <button key={s.id} type="button"
                    onClick={() => setForm(f => {
                      const current = f.subjectIds || [];
                      const next = current.includes(s.id)
                        ? current.filter(x => x !== s.id)
                        : [...current, s.id as SubjectId];
                      return { ...f, subjectIds: next };
                    })}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    style={active ? { backgroundColor: s.color } : {}}>
                    {s.icon} {s.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">بتتملي تلقائياً من مواد مجموعاته لما تضغط «ظبط المواد» في صفحة الكورسات</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">رقم الهاتف *</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          {canManagePay && (
            <div className="sm:col-span-2">
              <TeacherPayFields value={form} onChange={pay => setForm(current => ({ ...current, ...pay }))} />
              <p className="text-xs text-gray-500 mt-2">تعديل النسبة يؤثر على الكشوف غير المعتمدة فقط؛ الكشوف المعتمدة تحتفظ بنسبتها وتفاصيلها.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as TeacherStatus })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="active">نشط</option>
              <option value="vacation">إجازة</option>
              <option value="suspended">متوقف</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={task.pending} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
            {editingTeacher ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف المدرس" message="هل أنت متأكد من حذف هذا المدرس؟"
        onConfirm={async () => {
          if (!deleteId) return;
          await task.run(async () => {
            await deleteCatalogRecord(user, 'teachers', deleteId);
            notify.success('تم الحذف');
            await loadTeachers();
          });
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
