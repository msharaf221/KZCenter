import dayjs from 'dayjs';
import { Ban, CheckCircle, Download, Filter, MessageCircle, Plus, Printer, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import PageReadError from '../components/layout/PageReadError';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { readById } from '../data/readers';
import type { Payment, Settings } from '../domain/models';
import PaymentFormDialog from '../features/payments/PaymentFormDialog';
import RefundPaymentDialog from '../features/payments/RefundPaymentDialog';
import type { PaymentDraft, RefundDraft } from '../features/payments/types';
import VoidPaymentDialog from '../features/payments/VoidPaymentDialog';
import { useCommandTask } from '../hooks/useCommandTask';
import { usePageResource } from '../hooks/usePageResource';
import { isCountedPayment } from '../lib/billing';
import { METHOD_LABEL } from '../lib/cashbox';
import { notify, notifyLatePayment, notifyPaymentReceived } from '../lib/notifications';
import { amountToArabicWords, printReceipt } from '../lib/printing';
import { downloadCSV, formatCurrency, formatDate, getContrastColor, getWhatsAppLink, paymentStatusLabel, toCSV } from '../lib/utils';
import { getStudentBalance } from '../services/balanceService';
import { createPayment, deletePendingPayment, markPendingPaymentPaid } from '../services/commands/payments';
import { cancelStudentPayment, refundStudentPayment } from '../services/commands/studentFinance';
import { loadPaymentsList } from '../services/queries/payments';

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const task = useCommandTask();
  const { settings } = useApp();
  const { user, can } = useAuth();
  const canCreate = can('payments', 'create');
  const canEdit = can('payments', 'edit');
  const canDelete = can('payments', 'delete');
  const canMoney = can('refunds', 'create');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState<PaymentDraft>({
    studentId: '', courseId: '', amount: 0,
    type: 'subscription', status: 'paid',
    method: 'cash', collectedBy: '',
    date: dayjs().format('YYYY-MM-DD'), notes: '',
  });
  // إلغاء / استرداد
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundForm, setRefundForm] = useState<RefundDraft>({ amount: 0, reason: '', method: 'cash' });
  const busy = task.pending;

  const query = useCallback(() => loadPaymentsList({ page, pageSize: PAGE_SIZE, search, statusFilter }), [page, search, statusFilter]);
  const { data: { students, courses, payments, total, refunds }, loading, reload: load, error } = usePageResource(query, {
    students: [], courses: [], payments: [], total: 0, refunds: [],
  });
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  async function handleSave() {
    await task.run(async () => {
      const result = await createPayment(user, form, settings?.receiptPrefix);
      if (result.warning) notify.error(result.warning); else notify.success('تم إضافة الدفعة بنجاح');
      const student = students.find(student => student.id === form.studentId);
      if (student && form.status === 'paid') notifyPaymentReceived(student.name, form.amount);
      if (student && form.status === 'late') notifyLatePayment(student.name, form.amount);
      setShowModal(false);
      setForm(value => ({ ...value, studentId: '', courseId: '', amount: 0, notes: '', collectedBy: '' }));
      await load();
    });
  }

  // ---------- إلغاء دفعة (void) ----------
  async function handleVoid() {
    if (!voidTarget) return;
    if (!voidReason.trim()) { notify.error('سبب الإلغاء مطلوب للمراجعة'); return; }
    await task.run(async () => {
      const r = await cancelStudentPayment(user, {
        paymentId: voidTarget.id,
        reason: voidReason.trim(),
        userId: user?.id,
        username: user?.username,
      });
      if (!r.success) { notify.error(r.error || 'تعذّر الإلغاء'); return; }


      notify.success('تم إلغاء الدفعة (لسه موجودة في السجل للمراجعة)');
      setVoidTarget(null);
      setVoidReason('');
      await load();
    });
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
    await task.run(async () => {
      const r = await refundStudentPayment(user, {
        studentId: refundTarget.studentId,
        amount: refundForm.amount,
        reason: refundForm.reason.trim(),
        paymentId: refundTarget.id,
        method: refundForm.method,
        userId: user?.id,
        username: user?.username,
      });
      if (!r.success) { notify.error(r.error || 'تعذّر الاسترداد'); return; }


      notify.success('تم تسجيل الاسترداد وخصمه من مدفوعات الطالب');
      setRefundTarget(null);
      await load();
    });
  }

  /**
   * تحويل دفعة معلقة/متأخرة إلى مدفوعة:
   * - إيصال مسلسل (المعلق ما كانش له إيصال) بتاريخ التحصيل الفعلي
   * - تسجيل المحصِّل + الأثر في سجل المراجعة
   */
  async function markPaymentPaid(payment: Payment): Promise<void> {
    const result = await markPendingPaymentPaid(user, payment.id, settings?.receiptPrefix);
    if (result.warning) notify.error(result.warning);
  }

  async function handleMarkPaid(payment: Payment) {
    await task.run(async () => { await markPaymentPaid(payment); notify.success('تم تغيير الحالة إلى مدفوع'); await load(); });
  }

  async function handleDelete(id: string) {
    await task.run(async () => { await deletePendingPayment(user, id); notify.success('تم حذف الدفعة'); await load(); });
  }

  async function handleBulkMarkPaid() {
    await task.run(async () => {
      const selected = payments.filter(payment => selectedIds.includes(payment.id) && payment.status !== 'paid');
      for (const payment of selected) await markPaymentPaid(payment);
      notify.success(`تم تحديث ${selected.length} دفعة إلى مدفوع`);
      setSelectedIds([]); await load();
    });
  }

  /** إيصال رسمي عن طريق printing.ts (رقم مسلسل + طريقة الدفع + اسم الموظف + المبلغ بالحروف) */
  async function handlePrintReceipt(payment: Payment) {
    const freshSettings = await readById<Settings>('settings', 'main');
    const st = freshSettings || settings;
    const student = students.find(x => x.id === payment.studentId);
    const course = courses.find(c => c.id === payment.courseId);
    const before = await getStudentBalance(payment.studentId);
    const html = printReceipt({
      receiptNo: payment.receiptNo || payment.id.substring(0, 6).toUpperCase(),
      centerName: st?.centerName || 'EduCenter Pro',
      studentName: student?.name || '—',
      courseName: course?.name,
      amount: payment.amount,
      amountInWords: amountToArabicWords(payment.amount, st?.currency),
      method: METHOD_LABEL[payment.method || 'cash'],
      type: payment.type === 'subscription' ? 'اشتراك' : payment.type === 'books' ? 'كتب' : 'أخرى',
      date: payment.date,
      collectorName: payment.collectedByName || payment.collectedBy,
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
      status: paymentStatusLabel(p),
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
  // الملغي (voided) مش محسوب لا في المدفوع ولا في المعلق
  const totalPaid = payments.filter(isCountedPayment).reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter(p => !p.deleted && !p.voided && p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  // المتبقي الحقيقي على كل الطلاب (مبني على المستحقات/الأقساط المخزّنة على الطالب)
  const remainingOnStudents = students.filter(st => !st.deleted).reduce((s, st) => s + Math.max(0, (st.totalOwed || 0) - st.totalPaid), 0);
  const debtorsCount = students.filter(st => !st.deleted && (st.totalOwed || 0) - st.totalPaid > 0).length;

  if (error) return <PageReadError title="المدفوعات" onRetry={load} />;

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
            {canEdit && selectedIds.length > 0 && (
              <button onClick={handleBulkMarkPaid}
                className="flex items-center gap-2 px-3 py-2.5 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100">
                <CheckCircle size={16} /> تحديد كمدفوع ({selectedIds.length})
              </button>
            )}
            <div className="flex gap-2 mr-auto">
              <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                <Download size={16} /> تصدير
              </button>
              {canCreate && (
                <button onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
                  style={{ backgroundColor: settings?.primaryColor || '#6366f1', color: getContrastColor(settings?.primaryColor || '#6366f1') }}>
                  <Plus size={16} /> إضافة دفعة
                </button>
              )}
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
                        {(payment.collectedByName || payment.collectedBy) && <span className="block text-[10px] text-gray-400 font-normal">قبض: {payment.collectedByName || payment.collectedBy}</span>}
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
                          {canEdit && payment.status !== 'paid' && (
                            <button onClick={() => handleMarkPaid(payment)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="تحديد كمدفوع">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          {canMoney && !payment.voided && payment.status === 'paid' && (
                            <>
                              <button onClick={() => openRefund(payment)} className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600 transition-colors" title="استرداد مبلغ">
                                <RotateCcw size={15} />
                              </button>
                              <button onClick={() => { setVoidTarget(payment); setVoidReason(''); }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" title="إلغاء الدفعة">
                                <Ban size={15} />
                              </button>
                            </>
                          )}
                          {canDelete && !payment.voided && payment.status !== 'paid' && (
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
      <PaymentFormDialog open={showModal} onClose={() => setShowModal(false)} form={form} setForm={setForm} students={students} courses={courses} busy={busy || task.pending} onSave={handleSave} />

      <ConfirmDialog isOpen={!!deleteId} title="حذف الدفعة"
        message="الدفعة هتتحول لسلة المحذوفات ويمكن استرجاعها. لو الدفعة مسددة يفضل تستخدم «إلغاء» عشان السجل يفضل سليم."
        onConfirm={() => { if (deleteId) handleDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} danger />

      {/* إلغاء دفعة */}
      <VoidPaymentDialog payment={voidTarget} studentName={voidTarget ? getStudentName(voidTarget.studentId) : ''} reason={voidReason} onReasonChange={setVoidReason} onClose={() => setVoidTarget(null)} onConfirm={handleVoid} busy={busy} />

      {/* استرداد مبلغ */}
      <RefundPaymentDialog payment={refundTarget} studentName={refundTarget ? getStudentName(refundTarget.studentId) : ''} form={refundForm} onChange={setRefundForm} onClose={() => setRefundTarget(null)} onConfirm={handleRefund} busy={busy} />
    </Layout>
  );
}
