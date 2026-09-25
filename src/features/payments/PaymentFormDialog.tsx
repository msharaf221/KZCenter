import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import Modal from '../../components/ui/Modal';
import ResourceError from '../../components/ui/ResourceError';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Course, PaymentMethod, PaymentStatus, PaymentType, Student } from '../../domain/models';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { METHOD_LABEL } from '../../lib/cashbox';
import { formatCurrency, getContrastColor } from '../../lib/utils';
import { getStudentBalance } from '../../services/balanceService';
import { peekReceiptNo } from '../../services/receiptService';
import type { PaymentDraft } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  form: PaymentDraft;
  setForm: Dispatch<SetStateAction<PaymentDraft>>;
  students: Student[];
  courses: Course[];
  busy: boolean;
  onSave: () => Promise<void>;
}

export default function PaymentFormDialog({
  open: showModal,
  onClose,
  form,
  setForm,
  students,
  courses,
  busy,
  onSave: handleSave,
}: Props) {
  const { settings } = useApp();
  const { user } = useAuth();
  const studentId = form.studentId;
  const receiptDate = form.date;
  const receiptPrefix = settings?.receiptPrefix;
  const balanceQuery = useCallback(
    async () => ({
      studentId,
      balance: await getStudentBalance(studentId),
    }),
    [studentId],
  );
  const { data: balanceData, error: balanceError, reload: reloadBalance } = useAsyncResource(
    balanceQuery,
    { studentId: '', balance: null },
    {
      enabled: showModal && !!studentId,
    },
  );
  const studentBalance = !balanceError && balanceData.studentId === studentId ? balanceData.balance : null;

  const receiptQuery = useCallback(
    async () => ({
      date: receiptDate,
      prefix: receiptPrefix,
      value: await peekReceiptNo(receiptDate, receiptPrefix),
    }),
    [receiptDate, receiptPrefix],
  );
  const { data: receiptData, error: receiptError, reload: reloadReceipt } = useAsyncResource(
    receiptQuery,
    { date: '', prefix: undefined, value: '' },
    {
      enabled: showModal,
    },
  );
  const receiptPreview =
    receiptData.date === receiptDate && receiptData.prefix === receiptPrefix ? receiptData.value : '';

  return (
    <Modal isOpen={showModal} onClose={onClose} title="إضافة دفعة جديدة">
      <div className="space-y-4">
        {balanceError && <ResourceError onRetry={reloadBalance} message="تعذّر تحميل رصيد الطالب." />}
        {receiptError && <ResourceError onRetry={reloadReceipt} message="تعذّر تحميل معاينة رقم الإيصال." />}
        {form.status === 'paid' && receiptPreview && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <span className="text-xs text-indigo-700">رقم الإيصال التسلسلي</span>
            <span className="font-mono text-sm font-bold text-indigo-900" dir="ltr">
              {receiptPreview}
            </span>
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">الطالب *</label>
          <select
            value={form.studentId}
            onChange={e => {
              const studentId = e.target.value;
              setForm({ ...form, studentId });
            }}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
          >
            <option value="">اختر طالباً</option>
            {students.map(s => {
              const debt = (s.totalOwed || 0) - s.totalPaid;
              return (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {debt > 0 ? ` — عليه ${debt.toLocaleString('ar-EG')}` : ''}
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
                {studentBalance.groups
                  .filter(g => g.remaining > 0)
                  .map(g => (
                    <div key={g.groupId} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        {g.groupName} <span className="text-gray-400">({g.courseName})</span>
                      </span>
                      <span className="font-bold text-red-600">{formatCurrency(g.remaining, settings?.currency)}</span>
                    </div>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    const groupRemaining = studentBalance.groups.reduce((s, g) => s + g.remaining, 0);
                    setForm(f => ({
                      ...f,
                      amount: groupRemaining,
                      type: 'subscription',
                      status: 'paid',
                      courseId: studentBalance.groups[0]
                        ? courses.find(c => c.name === studentBalance.groups[0].courseName)?.id || f.courseId
                        : f.courseId,
                      notes: f.notes || 'سداد المتبقي',
                    }));
                  }}
                  className="w-full mt-1 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  تعبئة المبلغ بالمتبقي كله (
                  {formatCurrency(
                    studentBalance.groups.reduce((s, g) => s + g.remaining, 0),
                    settings?.currency,
                  )}
                  )
                </button>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">الكورس</label>
          <select
            value={form.courseId}
            onChange={e => setForm({ ...form, courseId: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
          >
            <option value="">بدون كورس محدد</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ *</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: +e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الدفع</label>
            <select
              value={form.method}
              onChange={e => setForm({ ...form, method: e.target.value as PaymentMethod })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
            >
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">موظف التحصيل</label>
            <input
              type="text"
              value={form.collectedBy}
              onChange={e => setForm({ ...form, collectedBy: e.target.value })}
              placeholder={user?.username || 'الاسم'}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">النوع</label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as PaymentType })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
            >
              <option value="subscription">اشتراك</option>
              <option value="books">كتب</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الحالة</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value as PaymentStatus })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white"
            >
              <option value="paid">مدفوع</option>
              <option value="pending">معلق</option>
              <option value="late">متأخر</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none"
          />
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button
          onClick={handleSave}
          disabled={busy}
          className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
          style={{
            backgroundColor: settings?.primaryColor || '#6366f1',
            color: getContrastColor(settings?.primaryColor || '#6366f1'),
          }}
        >
          {busy ? 'جاري الحفظ...' : 'إضافة'}
        </button>
        <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm">
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
