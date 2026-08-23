import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { dbGetAll, dbAdd, dbPut, dbSoftDelete, generateId, InventoryItem, Course } from '../lib/db';
import { formatCurrency, formatDate } from '../lib/utils';
import { notify } from '../lib/notifications';
import { useApp } from '../contexts/AppContext';

const INITIAL_FORM = {
  name: '',
  type: 'handout' as 'book' | 'handout' | 'other',
  costPrice: 0,
  sellPrice: 0,
  stock: 0,
  courseId: '',
};

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { settings } = useApp();

  const load = useCallback(async () => {
    try {
      const [invData, coursesData] = await Promise.all([
        dbGetAll<InventoryItem>('inventory'),
        dbGetAll<Course>('courses')
      ]);
      setItems(invData.filter(i => !i.deleted).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setCourses(coursesData.filter(c => !c.deleted));
    } catch {
      notify.error('حدث خطأ أثناء تحميل المخزن');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.name.trim()) { notify.error('يرجى إدخال اسم الملزمة/الكتاب'); return; }
    if (form.costPrice < 0 || form.sellPrice < 0) { notify.error('الأسعار غير صحيحة'); return; }

    try {
      if (editId) {
        const existing = items.find(i => i.id === editId);
        if (existing) {
          await dbPut('inventory', { ...existing, ...form, updatedAt: new Date().toISOString() });
          notify.success('تم التعديل بنجاح');
        }
      } else {
        const item: InventoryItem = {
          id: generateId(),
          ...form,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await dbAdd('inventory', item);
        notify.success('تمت الإضافة بنجاح');
      }
      setShowModal(false);
      load();
    } catch {
      notify.error('حدث خطأ أثناء الحفظ');
    }
  }

  async function handleDelete(id: string) {
    try {
      await dbSoftDelete('inventory', id);
      notify.success('تم الحذف بنجاح');
      load();
    } catch {
      notify.error('حدث خطأ أثناء الحذف');
    }
  }

  function openEdit(item: InventoryItem) {
    setForm({
      name: item.name,
      type: item.type,
      costPrice: item.costPrice,
      sellPrice: item.sellPrice,
      stock: item.stock,
      courseId: item.courseId || '',
    });
    setEditId(item.id);
    setShowModal(true);
  }

  function openAdd() {
    setForm(INITIAL_FORM);
    setEditId(null);
    setShowModal(true);
  }

  const filteredItems = items.filter(i => i.name.includes(search));

  return (
    <Layout title="الملازم والمخزن">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="ابحث عن ملزمة أو كتاب..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-semibold hover:bg-opacity-90 w-full sm:w-auto" style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            <Plus size={20} /> إضافة للمخزن
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100 text-sm font-medium text-gray-500">
                  <th className="p-4">الاسم</th>
                  <th className="p-4">النوع</th>
                  <th className="p-4">الكورس (اختياري)</th>
                  <th className="p-4 text-center">التكلفة</th>
                  <th className="p-4 text-center">سعر البيع</th>
                  <th className="p-4 text-center">المخزون المتوفر</th>
                  <th className="p-4">تاريخ الإضافة</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center">جاري التحميل...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">لا توجد عناصر في المخزن</td></tr>
                ) : filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-semibold text-gray-900">{item.name}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${item.type === 'book' ? 'bg-blue-100 text-blue-700' : item.type === 'handout' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                        {item.type === 'book' ? 'كتاب' : item.type === 'handout' ? 'ملزمة' : 'أخرى'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {item.courseId ? courses.find(c => c.id === item.courseId)?.name || 'غير معروف' : '—'}
                    </td>
                    <td className="p-4 text-center text-sm font-medium text-gray-900">{formatCurrency(item.costPrice, settings?.currency)}</td>
                    <td className="p-4 text-center text-sm font-bold text-green-600">{formatCurrency(item.sellPrice, settings?.currency)}</td>
                    <td className="p-4 text-center">
                      <span className={`font-bold ${item.stock <= 5 ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.stock}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500">{formatDate(item.createdAt)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => setDeleteId(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? 'تعديل عنصر' : 'إضافة عنصر للمخزن'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الملزمة/الكتاب *</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">النوع</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value as any})}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none">
                <option value="handout">ملزمة</option>
                <option value="book">كتاب</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">مرتبط بكورس (اختياري)</label>
              <select value={form.courseId} onChange={e => setForm({...form, courseId: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none">
                <option value="">غير مرتبط</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التكلفة (سعر الشراء)</label>
              <input type="number" min="0" value={form.costPrice} onChange={e => setForm({...form, costPrice: +e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">سعر البيع للطالب</label>
              <input type="number" min="0" value={form.sellPrice} onChange={e => setForm({...form, sellPrice: +e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">الكمية المتوفرة حالياً</label>
              <input type="number" min="0" value={form.stock} onChange={e => setForm({...form, stock: +e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none" />
            </div>
          </div>
          <button onClick={handleSave} className="w-full py-2.5 text-white rounded-xl font-semibold" style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
            حفظ
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId} title="حذف العنصر"
        message="هل أنت متأكد من حذف هذا العنصر؟ لن تتمكن من استعادته."
        onConfirm={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} danger
      />
    </Layout>
  );
}
