import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, CheckCircle, Trash2, Download, MessageCircle, Printer } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { dbGetPaginated, dbPut, dbSoftDelete, dbAdd, dbGetAll, dbGetById, recalculateStudentTotalPaid, generateId, Payment, PaymentStatus, PaymentType, Student, Course, Settings } from '../lib/db';
import { formatDate, formatCurrency, toCSV, downloadCSV, getWhatsAppLink } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify, notifyLatePayment, notifyPaymentReceived } from '../lib/notifications';
import dayjs from 'dayjs';

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { settings } = useApp();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    studentId: '', courseId: '', amount: 0,
    type: 'subscription' as PaymentType, status: 'paid' as PaymentStatus,
    date: dayjs().format('YYYY-MM-DD'), notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allStudents = await dbGetAll<Student>('students');
      const allCourses = await dbGetAll<Course>('courses');
      setStudents(allStudents);
      setCourses(allCourses);

      const result = await dbGetPaginated<Payment>('payments', page, PAGE_SIZE, (p: Payment) => {
        const student = allStudents.find(s => s.id === p.studentId);
        const q = search.toLowerCase();
        const matchSearch = !q || (student?.name || '').toLowerCase().includes(q);
        const matchStatus = !statusFilter || p.status === statusFilter;
        return matchSearch && matchStatus;
      });
      setPayments(result.items);
      setTotal(result.total);
    } finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  async function handleSave() {
    if (!form.studentId) { notify.error('اختر طالباً'); return; }
    if (form.amount <= 0) { notify.error('المبلغ يجب أن يكون أكبر من 0'); return; }
    try {
      const payment: Payment = {
        id: generateId(), ...form,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await dbAdd('payments', payment);
      if (form.status === 'paid') {
        await recalculateStudentTotalPaid(form.studentId);
        const student = students.find(s => s.id === form.studentId);
        if (student) notifyPaymentReceived(student.name, form.amount);
      } else if (form.status === 'late') {
        const student = students.find(s => s.id === form.studentId);
        if (student) notifyLatePayment(student.name, form.amount);
      }
      notify.success('تم تسجيل الدفعة بنجاح');
      setShowModal(false);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function handleMarkPaid(payment: Payment) {
    try {
      await dbPut('payments', { ...payment, status: 'paid', updatedAt: new Date().toISOString() });
      await recalculateStudentTotalPaid(payment.studentId);
      notify.success('تم تغيير الحالة إلى مدفوع');
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function handleDelete(id: string) {
    const payment = payments.find(p => p.id === id);
    try {
      await dbSoftDelete('payments', id);
      if (payment?.status === 'paid') {
        await recalculateStudentTotalPaid(payment.studentId);
      }
      notify.success('تم حذف الدفعة');
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function handleBulkMarkPaid() {
    try {
      const selected = payments.filter(p => selectedIds.includes(p.id));
      for (const p of selected) {
        if (p.status !== 'paid') {
          await dbPut('payments', { ...p, status: 'paid', updatedAt: new Date().toISOString() });
          await recalculateStudentTotalPaid(p.studentId);
        }
      }
      notify.success(`تم تحديث ${selectedIds.length} دفعة إلى مدفوع`);
      setSelectedIds([]);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function printReceipt(payment: Payment) {
    const win = window.open('', '_blank');
    if (!win) return;
    
    win.document.write('<html dir="rtl"><head><title>جاري التحميل...</title></head><body style="font-family:sans-serif; text-align:center; padding: 20px;">جاري تجهيز الإيصال...</body></html>');

    const freshSettings = await dbGetById<Settings>('settings', 'main');
    const student = students.find(s => s.id === payment.studentId);
    const course = courses.find(c => c.id === payment.courseId);
    const date = formatDate(payment.date);
    
    const receiptHtml = `
      <html dir="rtl">
        <head>
          <title>إيصال استلام</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
            body { font-family: 'Tajawal', sans-serif; padding: 20px; color: #333; max-width: 300px; margin: 0 auto; border: 1px dashed #ccc; }
            h1 { text-align: center; color: ${freshSettings?.primaryColor || settings?.primaryColor || '#6366f1'}; margin-bottom: 5px; font-size: 20px; }
            .center { text-align: center; margin-bottom: 20px; font-size: 12px; color: #666; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; border-bottom: 1px dotted #eee; padding-bottom: 5px; }
            .total { font-size: 16px; font-weight: bold; margin-top: 20px; text-align: center; padding: 10px; background: #f8f9fa; border-radius: 8px; border: 1px solid #eee; }
            .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #888; }
            @media print { body { border: none; padding: 0; } }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h1>${freshSettings?.centerName || settings?.centerName || 'EduCenter Pro'}</h1>
          <div class="center">إيصال استلام نقدية</div>
          <div class="row"><span>رقم الإيصال:</span> <strong>#${payment.id.substring(0,6).toUpperCase()}</strong></div>
          <div class="row"><span>التاريخ:</span> <strong>${date}</strong></div>
          <div class="row"><span>اسم الطالب:</span> <strong>${student?.name || '---'}</strong></div>
          <div class="row"><span>البيان:</span> <strong>${payment.type === 'subscription' ? 'اشتراك' : payment.type === 'books' ? 'كتب' : 'أخرى'} ${course ? '- ' + course.name : ''}</strong></div>
          <div class="total">المبلغ المدفوع: <br/> ${formatCurrency(payment.amount, freshSettings?.currency || settings?.currency)}</div>
          <div class="footer">شكراً لثقتكم بنا.<br/>مع تمنياتنا بالتوفيق والنجاح.</div>
        </body>
      </html>
    `;
    
    win.document.open();
    win.document.write(receiptHtml);
    win.document.close();
  }

  function getStudentName(id: string) {
    return students.find(s => s.id === id)?.name || 'غير معروف';
  }
  function getCourseName(id?: string) {
    if (!id) return '—';
    return courses.find(c => c.id === id)?.name || '—';
  }

  function exportExcel() {
    const data = payments.map(p => ({
      student: getStudentName(p.studentId),
      course: getCourseName(p.courseId),
      amount: p.amount,
      type: p.type === 'subscription' ? 'اشتراك' : p.type === 'books' ? 'كتب' : 'أخرى',
      status: p.status === 'paid' ? 'مدفوع' : p.status === 'pending' ? 'معلق' : 'متأخر',
      date: p.date,
      notes: p.notes || '',
    }));
    const csv = toCSV(data as unknown as Record<string, unknown>[], [
      { key: 'student', label: 'الطالب' },
      { key: 'course', label: 'الكورس' },
      { key: 'amount', label: 'المبلغ' },
      { key: 'type', label: 'النوع' },
      { key: 'status', label: 'الحالة' },
      { key: 'date', label: 'التاريخ' },
      { key: 'notes', label: 'ملاحظات' },
    ]);
    downloadCSV(csv, 'payments.csv');
    notify.success('تم تصدير المدفوعات');
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);

  return (
    <Layout title="إدارة المدفوعات">
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">إجمالي الصفحة المدفوع</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">إجمالي المعلق</p>
            <p className="text-2xl font-bold text-orange-500">{formatCurrency(totalPending, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">عدد السجلات</p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث باسم الطالب..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="relative">
              <Filter size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="">كل الحالات</option>
                <option value="paid">مدفوع</option>
                <option value="pending">معلق</option>
                <option value="late">متأخر</option>
              </select>
            </div>
            {selectedIds.length > 0 && (
              <button onClick={handleBulkMarkPaid}
                className="flex items-center gap-2 px-3 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100">
                <CheckCircle size={16} /> تحديد كمدفوع ({selectedIds.length})
              </button>
            )}
            <div className="flex gap-2 mr-auto">
              <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                <Download size={16} /> تصدير
              </button>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
                style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>
                <Plus size={16} /> إضافة دفعة
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right w-10">
                    <input type="checkbox" onChange={e => setSelectedIds(e.target.checked ? payments.map(p => p.id) : [])}
                      checked={selectedIds.length === payments.length && payments.length > 0}
                      className="rounded" />
                  </th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الطالب</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الكورس</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المبلغ</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">النوع</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الحالة</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">التاريخ</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-600 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center">
                    <div className="animate-spin w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
                  </td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">لا توجد مدفوعات</td></tr>
                ) : payments.map(payment => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <input type="checkbox" checked={selectedIds.includes(payment.id)}
                        onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, payment.id] : selectedIds.filter(i => i !== payment.id))}
                        className="rounded" />
                    </td>
                    <td className="p-4 text-sm font-semibold text-gray-900">{getStudentName(payment.studentId)}</td>
                    <td className="p-4 text-sm text-gray-600">{getCourseName(payment.courseId)}</td>
                    <td className="p-4 text-sm font-bold text-gray-900">{formatCurrency(payment.amount, settings?.currency)}</td>
                    <td className="p-4">
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                        {payment.type === 'subscription' ? 'اشتراك' : payment.type === 'books' ? 'كتب' : 'أخرى'}
                      </span>
                    </td>
                    <td className="p-4"><Badge status={payment.status} /></td>
                    <td className="p-4 text-sm text-gray-500">{formatDate(payment.date)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        {payment.status === 'late' && (() => {
                          const student = students.find(s => s.id === payment.studentId);
                          if (student && student.parentPhone) {
                            return (
                              <a href={getWhatsAppLink(student.parentPhone, `نود تذكيركم بوجود دفعة متأخرة بقيمة ${payment.amount} للطالب/ة ${student.name}.`)}
                                target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="إرسال تذكير عبر واتساب">
                                <MessageCircle size={15} />
                              </a>
                            );
                          }
                          return null;
                        })()}
                        {payment.status === 'paid' && (
                          <button onClick={() => printReceipt(payment)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors" title="طباعة إيصال">
                            <Printer size={15} />
                          </button>
                        )}
                        {payment.status !== 'paid' && (
                          <button onClick={() => handleMarkPaid(payment)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="تحديد كمدفوع">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        <button onClick={() => setDeleteId(payment.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="حذف">
                          <Trash2 size={15} />
                        </button>
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

      {/* Add Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="إضافة دفعة جديدة">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الطالب *</label>
            <select value={form.studentId} onChange={e => setForm({...form, studentId: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="">اختر طالباً</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الكورس</label>
            <select value={form.courseId} onChange={e => setForm({...form, courseId: e.target.value})}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="">بدون كورس محدد</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
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
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">النوع</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value as PaymentType})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="subscription">اشتراك</option>
                <option value="books">كتب</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value as PaymentStatus})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                <option value="paid">مدفوع</option>
                <option value="pending">معلق</option>
                <option value="late">متأخر</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm"
            style={{ backgroundColor: settings?.primaryColor || '#6366f1' }}>إضافة</button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف الدفعة" message="هل أنت متأكد من حذف هذه الدفعة؟"
        onConfirm={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} danger />
    </Layout>
  );
}
