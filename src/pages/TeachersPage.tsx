import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { dbGetPaginated, dbPut, dbSoftDelete, dbAdd, dbGetAll, generateId, Teacher, TeacherStatus, Group } from '../lib/db';
import { formatCurrency } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';

const PAGE_SIZE = 20;

const INITIAL_FORM: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', specialization: '', phone: '', email: '',
  salary: 0, status: 'active', avatar: '', notes: '',
};

export default function TeachersPage() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState<Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>>(INITIAL_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dbGetPaginated<Teacher>('teachers', page, PAGE_SIZE, (t: Teacher) => {
        const q = search.toLowerCase();
        return !q || t.name.toLowerCase().includes(q) || t.specialization.toLowerCase().includes(q);
      });
      setTeachers(result.items);
      setTotal(result.total);

      const groups = await dbGetAll<Group>('groups');
      const gc: Record<string, number> = {};
      const sc: Record<string, number> = {};
      groups.forEach(g => {
        gc[g.teacherId] = (gc[g.teacherId] || 0) + 1;
        sc[g.teacherId] = (sc[g.teacherId] || 0) + g.studentIds.length;
      });
      setGroupCounts(gc);
      setStudentCounts(sc);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadTeachers(); }, [loadTeachers]);
  useEffect(() => { setPage(1); }, [search]);

  function openAdd() {
    setEditingTeacher(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  }

  function openEdit(t: Teacher) {
    setEditingTeacher(t);
    setForm({ name: t.name, specialization: t.specialization, phone: t.phone, email: t.email || '', salary: t.salary, status: t.status, avatar: t.avatar || '', notes: t.notes || '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { notify.error('الاسم مطلوب'); return; }
    if (!form.phone.trim()) { notify.error('الهاتف مطلوب'); return; }
    try {
      if (editingTeacher) {
        await dbPut('teachers', { ...editingTeacher, ...form, updatedAt: new Date().toISOString() });
        notify.success('تم تحديث بيانات المدرس');
      } else {
        await dbAdd('teachers', { id: generateId(), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        notify.success('تم إضافة المدرس بنجاح');
      }
      setShowModal(false);
      loadTeachers();
    } catch { notify.error('حدث خطأ أثناء الحفظ'); }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout title="إدارة المدرسين">
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو التخصص..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
              style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
              <Plus size={16} /> إضافة مدرس
            </button>
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
                  <p className="text-green-600 font-medium mt-1">💰 {formatCurrency(teacher.salary, settings?.currency)} / شهر</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/teachers/${teacher.id}`)} className="flex-1 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors">عرض</button>
                  <button onClick={() => openEdit(teacher)} className="flex-1 py-1.5 text-xs bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition-colors">تعديل</button>
                  <button onClick={() => setDeleteId(teacher.id)} className="flex-1 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">حذف</button>
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
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="اسم المدرس" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">التخصص *</label>
            <input type="text" value={form.specialization} onChange={e => setForm({...form, specialization: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="مثال: رياضيات، لغة عربية" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">رقم الهاتف *</label>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الراتب الشهري</label>
            <input type="number" value={form.salary} onChange={e => setForm({...form, salary: +e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value as TeacherStatus})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="active">نشط</option>
              <option value="vacation">إجازة</option>
              <option value="suspended">متوقف</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            {editingTeacher ? 'تحديث' : 'إضافة'}
          </button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف المدرس" message="هل أنت متأكد من حذف هذا المدرس؟"
        onConfirm={async () => {
          if (deleteId) {
            // حماية: منع حذف مدرس مرتبط بمجموعات نشطة
            const allGroups = await dbGetAll<Group>('groups');
            const linkedGroups = allGroups.filter(g => g.teacherId === deleteId && !g.deleted);
            if (linkedGroups.length > 0) {
              notify.error(`لا يمكن حذف المدرس - مسؤول عن ${linkedGroups.length} مجموعة. انقل المجموعات لمدرس آخر أولاً`);
            } else {
              await dbSoftDelete('teachers', deleteId);
              notify.success('تم الحذف');
              loadTeachers();
            }
          }
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
