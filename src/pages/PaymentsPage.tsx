import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, CheckCircle, Trash2, Download, MessageCircle, Printer, Ban, RotateCcw } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import { dbGetPaginated, dbPut, dbSoftDelete, dbAdd, dbGetAll, dbGetById, recalculateStudentTotalPaid, rebuildInstallmentsFromPayments, getStudentBalance, recordInstallmentPayment, voidPayment, recordRefund, getRefunds, generateId, Payment, PaymentStatus, PaymentType, PaymentMethod, Refund, Student, Course, Settings, StudentBalance } from '../lib/db';
import { printReceipt, amountToArabicWords } from '../lib/printing';
import { nextReceiptNo, peekReceiptNo } from '../lib/receipts';
import { METHOD_LABEL } from '../lib/cashbox';
import { formatDate, formatCurrency, toCSV, downloadCSV, getWhatsAppLink, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify, notifyLatePayment, notifyPaymentReceived } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import dayjs from 'dayjs';

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { settings } = useApp();
  const { user } = useAuth();
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
    method: 'cash' as PaymentMethod, collectedBy: '',
    date: dayjs().format('YYYY-MM-DD'), notes: '',
  });
  const [studentBalance, setStudentBalance] = useState<StudentBalance | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [receiptPreview, setReceiptPreview] = useState('');
  // إلغاء / استرداد
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: 0, reason: '', method: 'cash' as PaymentMethod });
  const [busy, setBusy] = useState(false);

  // رصيد الطالب المختار (مستحق/مدفوع/متبقي) لعرضه أثناء تسجيل الدفعة
  useEffect(() => {
    if (!form.studentId) return;
    let cancelled = false;
    getStudentBalance(form.studentId)
      .then(b => { if (!cancelled) setStudentBalance(b); })
      .catch(() => { if (!cancelled) setStudentBalance(null); });
    return () => { cancelled = true; };
  }, [form.studentId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const allStudents = await dbGetAll<Student>('students');
      const allCourses = await dbGetAll<Course>('courses');
      setStudents(allStudents);
      setCourses(allCourses);

      // Build Map for O(1) lookups instead of O(n) find per row
      const studentMap = new Map(allStudents.map(s => [s.id, s]));

      const result = await dbGetPaginated<Payment>('payments', page, PAGE_SIZE, (p: Payment) => {
        const student = studentMap.get(p.studentId);
        const q = search.trim().toLowerCase();
        const matchSearch = !q
          || (student?.name || '').toLowerCase().includes(q)
          || (p.receiptNo || '').toLowerCase().includes(q)
          || (p.collectedBy || '').toLowerCase().includes(q)
          || String(p.amount).includes(q);
        const matchStatus = !statusFilter || p.status === statusFilter;
        return matchSearch && matchStatus;
      });
      setPayments(result.items);
      setTotal(result.total);
      setRefunds(await getRefunds());
    } finally { setLoading(false); }
  }, [page, search, statusFilter]);

  // رقم الإيصال التسلسلي المتوقع (بيتعرض في الفورم وبيتأكد وقت الحفظ)
  useEffect(() => {
    let cancelled = false;
    peekReceiptNo(form.date, settings?.receiptPrefix)
      .then(n => { if (!cancelled) setReceiptPreview(n); })
      .catch(() => { if (!cancelled) setReceiptPreview(''); });
    return () => { cancelled = true; };
  }, [form.date, showModal, settings?.receiptPrefix]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  async function handleSave() {
    if (!form.studentId) { notify.error('اختر طالباً'); return; }
    if (form.amount <= 0) { notify.error('المبلغ يجب أن يكون أكبر من 0'); return; }
    try {
      let payment: Payment;

      if (form.status === 'paid' && form.type === 'subscription') {
        // أي دفعة اشتراك مسددة لازم تتوزّع على الأقساط،
        // وإلا المستحقات المخزّنة على الأقساط هتفضل "غير مدفوعة" والأرقام تتلخبط.
        const result = await recordInstallmentPayment({
          studentId: form.studentId,
          amount: form.amount,
          date: form.date,
          courseId: form.courseId || undefined,
          notes: form.notes || undefined,
          method: form.method,
          collectedBy: form.collectedBy || user?.username || undefined,
        });
        if (!result.success || !result.payment) { notify.error(result.error || 'حدث خطأ'); return; }
        payment = result.payment;
      } else {
        // معلق/متأخر أو بنود غير الاشتراك (كتب/أخرى): تسجل كدفعة من غير توزيع على أقساط
        payment = {
          id: generateId(), ...form,
          collectedBy: form.collectedBy || user?.username || undefined,
          // الإيصال المسلسل بيتسجل للدفعات المسددة فقط — المعلق ما لوش إيصال
          receiptNo: form.status === 'paid'
            ? await nextReceiptNo(form.date, settings?.receiptPrefix)
            : undefined,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        await dbAdd('payments', payment);
        await recalculateStudentTotalPaid(form.studentId);
      }

      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'create', entity: 'payment', entityId: payment.id,
        details: `تسجيل دفعة بقيمة ${payment.amount} للطالب: ${getStudentName(payment.studentId)}`,
      });
      if (form.status === 'paid') {
        const student = students.find(s => s.id === form.studentId);
        if (student) notifyPaymentReceived(student.name, form.amount);
      } else if (form.status === 'late') {
        const student = students.find(s => s.id === form.studentId);
        if (student) notifyLatePayment(student.name, form.amount);
      }
      notify.success(payment.receiptNo ? `تم تسجيل الدفعة — إيصال رقم ${payment.receiptNo}` : 'تم تسجيل الدفعة بنجاح');
      setShowModal(false);
      setForm(f => ({ ...f, studentId: '', courseId: '', amount: 0, notes: '', collectedBy: '' }));
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  // ---------- إلغاء دفعة (void) ----------
  async function handleVoid() {
    if (!voidTarget) return;
    if (!voidReason.trim()) { notify.error('سبب الإلغاء مطلوب للمراجعة'); return; }
    setBusy(true);
    try {
      const r = await voidPayment({
        paymentId: voidTarget.id,
        reason: voidReason.trim(),
        userId: user?.id,
        username: user?.username,
      });
      if (!r.success) { notify.error(r.error || 'تعذّر الإلغاء'); return; }

      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'update', entity: 'payment', entityId: voidTarget.id,
        details: `إلغاء دفعة (${voidTarget.amount}) للطالب ${getStudentName(voidTarget.studentId)} — السبب: ${voidReason.trim()}`,
      });
      await recalculateStudentTotalPaid(voidTarget.studentId);
      notify.success('تم إلغاء الدفعة (لسه موجودة في السجل للمراجعة)');
      setVoidTarget(null);
      setVoidReason('');
      await load();
    } finally { setBusy(false); }
  }

  // ---------- استرداد مبلغ (refund) ----------
  function openRefund(payment: Payment) {
    setRefundTarget(payment);
    setRefundForm({ amount: payment.amount, reason: '', method: payment.method || 'cash' });
  }

  async function handleRefund() {
    if (!refundTarget) return;
    if (!(refundForm.amount > 0)) { notify.error('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (!refundForm.reason.trim()) { notify.error('سبب الاسترداد مطلوب'); return; }
    setBusy(true);
    try {
      const r = await recordRefund({
        studentId: refundTarget.studentId,
        amount: refundForm.amount,
        reason: refundForm.reason.trim(),
        paymentId: refundTarget.id,
        method: refundForm.method,
        userId: user?.id,
        username: user?.username,
      });
      if (!r.success) { notify.error(r.error || 'تعذّر الاسترداد'); return; }

      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'create', entity: 'refund', entityId: r.refund?.id,
        details: `استرداد ${refundForm.amount} من دفعة ${refundTarget.receiptNo || refundTarget.id} — ${refundForm.reason.trim()}`,
      });
      notify.success('تم تسجيل الاسترداد وخصمه من مدفوعات الطالب');
      setRefundTarget(null);
      await load();
    } finally { setBusy(false); }
  }

  async function handleMarkPaid(payment: Payment) {
    try {
      await dbPut('payments', { ...payment, status: 'paid', updatedAt: new Date().toISOString() });
      // الدفعة بقت مسددة → لازم تتوزّع على الأقساط
      await rebuildInstallmentsFromPayments(payment.studentId);
      notify.success('تم تغيير الحالة إلى مدفوع');
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function handleDelete(id: string) {
    const payment = payments.find(p => p.id === id);
    try {
      await dbSoftDelete('payments', id);
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'delete', entity: 'payment', entityId: id,
        details: `حذف دفعة بقيمة ${payment?.amount ?? 0} للطالب: ${payment ? getStudentName(payment.studentId) : 'غير معروف'}`,
      });
      if (payment?.status === 'paid') {
        // إعادة بناء الأقساط من الدفعات المتبقية بعد الحذف
        await rebuildInstallmentsFromPayments(payment.studentId);
      }
      notify.success('تم حذف الدفعة');
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  async function handleBulkMarkPaid() {
    try {
      const selected = payments.filter(p => selectedIds.includes(p.id));
      const affectedStudents = new Set<string>();
      for (const p of selected) {
        if (p.status !== 'paid') {
          await dbPut('payments', { ...p, status: 'paid', updatedAt: new Date().toISOString() });
          affectedStudents.add(p.studentId);
        }
      }
      for (const sid of affectedStudents) {
        await rebuildInstallmentsFromPayments(sid);
      }
      notify.success(`تم تحديث ${selectedIds.length} دفعة إلى مدفوع`);
      setSelectedIds([]);
      load();
    } catch { notify.error('حدث خطأ'); }
  }

  /** إيصال رسمي عن طريق printing.ts (رقم مسلسل + طريقة الدفع + اسم الموظف + المبلغ بالحروف) */
  async function handlePrintReceipt(payment: Payment) {
    const freshSettings = await dbGetById<Settings>('settings', 'main');
    const st = freshSettings || settings;
    const student = students.find(x => x.id === payment.studentId);
    const course = courses.find(c => c.id === payment.courseId);
    const group = (payment.installmentIds || []).length
      ? undefined
      : undefined;

    const before = await getStudentBalance(payment.studentId);
    const html = printReceipt({
      receiptNo: payment.receiptNo || payment.id.substring(0, 6).toUpperCase(),
      centerName: st?.centerName || 'EduCenter Pro',
      studentName: student?.name || '—',
      courseName: course?.name,
      groupName: group,
      amount: payment.amount,
      amountInWords: amountToArabicWords(payment.amount, st?.currency),
      method: METHOD_LABEL[payment.method || 'cash'],
      type: payment.type === 'subscription' ? 'اشتراك' : payment.type === 'books' ? 'كتب' : 'أخرى',
      date: payment.date,
      collectorName: payment.collectedBy,
      remainingAfter: before ? Math.max(0, before.remaining) : undefined,
      notes: payment.notes,
      settings: st,
    });
    const win = window.open('', '_blank');
    if (!win) { notify.error('المتصفح منع فتح نافذة الطباعة'); return; }
    win.document.open();
    win.document.write(html);
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
  // المتبقي الحقيقي على كل الطلاب (مبني على المستحقات/الأقساط المخزّنة على الطالب)
  const remainingOnStudents = students.reduce((s, st) => s + Math.max(0, (st.totalOwed || 0) - st.totalPaid), 0);
  const debtorsCount = students.filter(st => (st.totalOwed || 0) - st.totalPaid > 0).length;

  return (
    <Layout title="إدارة المدفوعات">
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">إجمالي الصفحة المدفوع</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">إجمالي المعلق</p>
            <p className="text-2xl font-bold text-orange-500">{formatCurrency(totalPending, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">المتبقي على الطلاب</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(remainingOnStudents, settings?.currency)}</p>
            <p className="text-xs text-gray-400 mt-1">{debtorsCount} طالب عليهم مبالغ</p>
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
                style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
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
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الإيصال</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الطالب</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الكورس</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الطريقة</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المبلغ</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">النوع</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الحالة</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">التاريخ</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-600 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={10} className="p-8 text-center">
                    <div className="animate-spin w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
                  </td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-gray-400">لا توجد مدفوعات</td></tr>
                ) : payments.map(payment => {
                  const refunded = refunds.filter(r => r.paymentId === payment.id).reduce((t, r) => t + r.amount, 0);
                  return (
                  <tr key={payment.id} className={`hover:bg-gray-50 transition-colors ${payment.voided ? 'bg-red-50/40' : ''}`}>
                    <td className="p-4">
                      <input type="checkbox" checked={selectedIds.includes(payment.id)} disabled={!!payment.voided}
                        onChange={e => setSelectedIds(e.target.checked ? [...selectedIds, payment.id] : selectedIds.filter(i => i !== payment.id))}
                        className="rounded" />
                    </td>
                    <td className="p-4 text-sm">
                      {payment.receiptNo ? (
                        <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded" dir="ltr">{payment.receiptNo}</span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                      {payment.voided && (
                        <span className="block mt-1 text-[10px] font-bold text-red-600">ملغاة — {payment.voidReason}</span>
                      )}
                    </td>
                    <td className="p-4 text-sm font-semibold text-gray-900">
                      <span className={payment.voided ? 'line-through text-gray-400' : ''}>{getStudentName(payment.studentId)}</span>
                      {payment.collectedBy && <span className="block text-[10px] text-gray-400 font-normal">قبض: {payment.collectedBy}</span>}
                    </td>
                    <td className="p-4 text-sm text-gray-600">{getCourseName(payment.courseId)}</td>
                    <td className="p-4 text-sm">
                      <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-1 rounded-full whitespace-nowrap">
                        {METHOD_LABEL[payment.method || 'cash']}
                      </span>
                    </td>
                    <td className={`p-4 text-sm font-bold ${payment.voided ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {formatCurrency(payment.amount, settings?.currency)}
                      {refunded > 0 && !payment.voided && (
                        <span className="block text-[10px] text-orange-600 font-normal no-underline">
                          مسترد: {formatCurrency(refunded, settings?.currency)}
                        </span>
                      )}
                    </td>
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
                          <button onClick={() => handlePrintReceipt(payment)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors" title="طباعة إيصال">
                            <Printer size={15} />
                          </button>
                        )}
                        {payment.status !== 'paid' && (
                          <button onClick={() => handleMarkPaid(payment)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="تحديد كمدفوع">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {!payment.voided && payment.status === 'paid' && (
                          <>
                            <button onClick={() => openRefund(payment)} className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600 transition-colors" title="استرداد مبلغ">
                              <RotateCcw size={15} />
                            </button>
                            <button onClick={() => { setVoidTarget(payment); setVoidReason(''); }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="إلغاء الدفعة">
                              <Ban size={15} />
                            </button>
                          </>
                        )}
                        {!payment.voided && payment.status !== 'paid' && (
                          <button onClick={() => setDeleteId(payment.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="حذف">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
        </div>
      </div>

      {/* Add Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="إضافة دفعة جديدة">
        <div className="space-y-4">
          {form.status === 'paid' && receiptPreview && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-100">
              <span className="text-xs text-indigo-700">رقم الإيصال التسلسلي</span>
              <span className="font-mono text-sm font-bold text-indigo-900" dir="ltr">{receiptPreview}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الطالب *</label>
            <select value={form.studentId}
              onChange={e => {
                const studentId = e.target.value;
                setForm({ ...form, studentId });
                if (!studentId) setStudentBalance(null);
              }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="">اختر طالباً</option>
              {students.map(s => {
                const debt = (s.totalOwed || 0) - s.totalPaid;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}{debt > 0 ? ` — عليه ${debt.toLocaleString('ar-EG')}` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* رصيد الطالب المختار */}
          {form.studentId && studentBalance && (
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
                <div>
                  <p className="text-gray-400">المطلوب</p>
                  <p className="font-bold text-gray-800">{formatCurrency(studentBalance.owed, settings?.currency)}</p>
                </div>
                <div>
                  <p className="text-gray-400">المدفوع</p>
                  <p className="font-bold text-green-600">{formatCurrency(studentBalance.paid, settings?.currency)}</p>
                </div>
                <div>
                  <p className="text-gray-400">المتبقي</p>
                  <p className={`font-bold ${studentBalance.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(Math.max(0, studentBalance.remaining), settings?.currency)}
                  </p>
                </div>
              </div>
              {studentBalance.groups.filter(g => g.remaining > 0).length > 0 && (
                <div className="space-y-1 border-t border-gray-200 pt-2">
                  {studentBalance.groups.filter(g => g.remaining > 0).map(g => (
                    <div key={g.groupId} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{g.groupName} <span className="text-gray-400">({g.courseName})</span></span>
                      <span className="font-bold text-red-600">{formatCurrency(g.remaining, settings?.currency)}</span>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => {
                      const groupRemaining = studentBalance.groups.reduce((s, g) => s + g.remaining, 0);
                      setForm(f => ({
                        ...f,
                        amount: groupRemaining,
                        type: 'subscription',
                        status: 'paid',
                        courseId: studentBalance.groups[0]
                          ? (courses.find(c => c.name === studentBalance.groups[0].courseName)?.id || f.courseId)
                          : f.courseId,
                        notes: f.notes || 'سداد المتبقي',
                      }));
                    }}
                    className="w-full mt-1 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                    تعبئة المبلغ بالمتبقي كله ({formatCurrency(studentBalance.groups.reduce((s, g) => s + g.remaining, 0), settings?.currency)})
                  </button>
                </div>
              )}
            </div>
          )}
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
              <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الدفع</label>
              <select value={form.method} onChange={e => setForm({...form, method: e.target.value as PaymentMethod})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => (
                  <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">موظف التحصيل</label>
              <input type="text" value={form.collectedBy} onChange={e => setForm({...form, collectedBy: e.target.value})}
                placeholder={user?.username || 'الاسم'}
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
            style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>إضافة</button>
          <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">إلغاء</button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="حذف الدفعة"
        message="الدفعة هتتحول لسلة المحذوفات ويمكن استرجاعها. لو الدفعة مسددة يفضل تستخدم «إلغاء» عشان السجل يفضل سليم."
        onConfirm={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} danger />

      {/* إلغاء دفعة */}
      <Modal isOpen={!!voidTarget} onClose={() => setVoidTarget(null)} title="إلغاء الدفعة">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">الإيصال</span>
              <span className="font-mono font-bold" dir="ltr">{voidTarget?.receiptNo || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">الطالب</span>
              <span className="font-bold">{voidTarget ? getStudentName(voidTarget.studentId) : ''}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">المبلغ</span>
              <span className="font-bold">{formatCurrency(voidTarget?.amount || 0, settings?.currency)}</span></div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            الإلغاء مش حذف: الدفعة بتفضل في السجل برقمها وسبب الإلغاء، لكنها ما بتتحسبش في أي مجموع
            والمبلغ هيرجع يظهر «باقي» على الطالب تاني.
          </p>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">سبب الإلغاء *</label>
            <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} rows={2}
              placeholder="مثال: تسجيل بالخطأ / إلغاء اشتراك / تعديل مبلغ"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleVoid} disabled={busy || !voidReason.trim()}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {busy ? 'جاري التنفيذ...' : 'إلغاء الدفعة'}
            </button>
            <button onClick={() => setVoidTarget(null)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">تراجع</button>
          </div>
        </div>
      </Modal>

      {/* استرداد مبلغ */}
      <Modal isOpen={!!refundTarget} onClose={() => setRefundTarget(null)} title="استرداد مبلغ">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">الطالب</span>
              <span className="font-bold">{refundTarget ? getStudentName(refundTarget.studentId) : ''}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">الدفعة الأصلية</span>
              <span className="font-mono font-bold" dir="ltr">{refundTarget?.receiptNo || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">قيمتها</span>
              <span className="font-bold">{formatCurrency(refundTarget?.amount || 0, settings?.currency)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المسترد *</label>
              <input type="number" min={0} max={refundTarget?.amount || 0} step="0.01"
                value={refundForm.amount} onChange={e => setRefundForm({...refundForm, amount: +e.target.value})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الصرف</label>
              <select value={refundForm.method} onChange={e => setRefundForm({...refundForm, method: e.target.value as PaymentMethod})}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none">
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => (
                  <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">سبب الاسترداد *</label>
            <textarea value={refundForm.reason} onChange={e => setRefundForm({...refundForm, reason: e.target.value})} rows={2}
              placeholder="مثال: انسحاب الطالب / زيادة في الدفع"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            الاسترداد بيقلل «المدفوع» على الطالب وبيظهر في الخزينة كخروج نقدي في يومه.
          </p>
          <div className="flex gap-2">
            <button onClick={handleRefund} disabled={busy || !(refundForm.amount > 0) || !refundForm.reason.trim()}
              className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
              {busy ? 'جاري التنفيذ...' : 'تأكيد الاسترداد'}
            </button>
            <button onClick={() => setRefundTarget(null)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">تراجع</button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
