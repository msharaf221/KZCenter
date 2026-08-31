import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip } from 'recharts';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import { dbGetPaginated, dbGetAll, dbPut, dbSoftDelete, dbAdd, generateId, Expense, ExpenseCategory } from '../lib/db';
import { formatDate, formatCurrency, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import dayjs from 'dayjs';

const PAGE_SIZE = 20;
const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salaries: 'رواتب', bills: 'فواتير', maintenance: 'صيانة',
  purchases: 'مشتريات', rent: 'إيجار', other: 'أخرى',
};
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4'];

export default function ExpensesPage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: 'other' as ExpenseCategory,
    amount: 0, description: '',
    date: dayjs().format('YYYY-MM-DD'),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await dbGetAll<Expense>('expenses');
      setAllExpenses(all);
      const result = await dbGetPaginated<Expense>('expenses', page, PAGE_SIZE, (e: Expense) => {
        const q = search.toLowerCase();
        const matchSearch = !q || e.description.toLowerCase().includes(q);
        const matchCat = !categoryFilter || e.category === categoryFilter;
        return matchSearch && matchCat;
      });
      setExpenses(result.items);
      setTotal(result.total);
    } finally { setLoading(false); }
  }, [page, search, categoryFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, categoryFilter]);

  function openAdd() {
    setEditing(null);
    setForm({ category: 'other', amount: 0, description: '', date: dayjs().format('YYYY-MM-DD') });
    setShowModal(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setForm({ category: e.category, amount: e.amount, description: e.description, date: e.date });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.description.trim()) { notify.error('الوصف مطلوب'); return; }
    if (form.amount <= 0) { notify.error('المبلغ يجب أن يكون أكبر من 0'); return; }
    try {
      const expenseId = editing?.id || generateId();
      if (editing) {
        await dbPut('expenses', { ...editing, ...form, updatedAt: new Date().toISOString() });
        notify.success('تم تحديث المصروف');
        addAuditEntry({
          userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
          action: 'update', entity: 'expense', entityId: expenseId,
          details: `تعديل مصروف: ${form.description} (${form.amount})`,
        });
      } else {
        await dbAdd('expenses', { id: expenseId, ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        notify.success('تم إضافة المصروف');
        addAuditEntry({
          userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
          action: 'create', entity: 'expense', entityId: expenseId,
          details: `إضافة مصروف: ${form.description} (${form.amount})`,
        });
      }
      setShowModal(false);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  // Pie data
  const categoryTotals: Record<string, number> = {};
  allExpenses.forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
  const pieData = Object.entries(categoryTotals).map(([cat, amount]) => ({
    name: CATEGORY_LABELS[cat as ExpenseCategory] || cat,
    value: amount,
  }));

  const totalAll = allExpenses.reduce((s, e) => s + e.amount, 0);
  const thisMonth = allExpenses.filter(e => e.date.startsWith(dayjs().format('YYYY-MM'))).reduce((s, e) => s + e.amount, 0);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout title="إدارة المصروفات">
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">إجمالي المصروفات</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalAll, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">هذا الشهر</p>
            <p className="text-2xl font-bold text-orange-500">{formatCurrency(thisMonth, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm text-gray-500">عدد السجلات</p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pie chart */}
          {pieData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-base font-bold text-gray-900 mb-3">توزيع المصروفات</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name }) => name}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [formatCurrency(Number(v), settings?.currency), 'المبلغ']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Table */}
          <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${pieData.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-36 relative">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="بحث..."
                    className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none" />
                </div>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                  <option value="">كل الفئات</option>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={openAdd}
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium mr-auto"
                  style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
                  <Plus size={16} /> إضافة
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right text-xs font-semibold text-gray-600">الفئة</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-600">الوصف</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-600">المبلغ</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-600">التاريخ</th>
                    <th className="p-3 text-center text-xs font-semibold text-gray-600">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center">
                      <div className="animate-spin w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
                    </td></tr>
                  ) : expenses.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد مصروفات</td></tr>
                  ) : expenses.map(expense => (
                    <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3">
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                          {CATEGORY_LABELS[expense.category]}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-900">{expense.description}</td>
                      <td className="p-3 text-sm font-bold text-red-600">{formatCurrency(expense.amount, settings?.currency)}</td>
                      <td className="p-3 text-sm text-gray-500">{formatDate(expense.date)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(expense)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600"><Edit2 size={14} /></button>
                          <button onClick={() => setDeleteId(expense.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
          </div>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل المصروف' : 'إضافة مصروف'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الفئة</label>
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value as ExpenseCategory})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الوصف *</label>
            <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="وصف المصروف" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ *</label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: +e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" min="0" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
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

      <ConfirmDialog isOpen={!!deleteId} title="حذف المصروف" message="هل أنت متأكد؟"
        onConfirm={async () => {
          if (deleteId) {
            const exp = expenses.find(e => e.id === deleteId);
            await dbSoftDelete('expenses', deleteId);
            addAuditEntry({
              userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
              action: 'delete', entity: 'expense', entityId: deleteId,
              details: `حذف مصروف: ${exp?.description || deleteId}`,
            });
            notify.success('تم الحذف');
            load();
          }
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
