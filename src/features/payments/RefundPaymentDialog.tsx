import type { Dispatch, SetStateAction } from 'react';
import Modal from '../../components/ui/Modal';
import { useApp } from '../../contexts/AppContext';
import type { Payment, PaymentMethod } from '../../domain/models';
import { METHOD_LABEL } from '../../lib/cashbox';
import { formatCurrency } from '../../lib/utils';
import type { RefundDraft } from './types';

interface Props {
  payment: Payment | null;
  studentName: string;
  form: RefundDraft;
  onChange: Dispatch<SetStateAction<RefundDraft>>;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  busy: boolean;
}

export default function RefundPaymentDialog({
  payment: refundTarget,
  studentName,
  form: refundForm,
  onChange: setRefundForm,
  onClose,
  onConfirm: handleRefund,
  busy,
}: Props) {
  const { settings } = useApp();

  return (
    <Modal isOpen={!!refundTarget} onClose={() => { if (!busy) onClose(); }} title="استرداد مبلغ">
      <div className="space-y-4">
        <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">الطالب</span>
            <span className="font-bold">{studentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">الدفعة الأصلية</span>
            <span className="font-mono font-bold" dir="ltr">
              {refundTarget?.receiptNo || '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">قيمتها</span>
            <span className="font-bold">{formatCurrency(refundTarget?.amount || 0, settings?.currency)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المسترد *</label>
            <input
              type="number"
              min={0}
              max={refundTarget?.amount || 0}
              step="0.01"
              value={refundForm.amount}
              onChange={e => setRefundForm({ ...refundForm, amount: +e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الصرف</label>
            <select
              value={refundForm.method}
              onChange={e => setRefundForm({ ...refundForm, method: e.target.value as PaymentMethod })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none"
            >
              {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map(m => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">سبب الاسترداد *</label>
          <textarea
            value={refundForm.reason}
            onChange={e => setRefundForm({ ...refundForm, reason: e.target.value })}
            rows={2}
            placeholder="مثال: انسحاب الطالب / زيادة في الدفع"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none"
          />
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          الاسترداد بيقلل «المدفوع» على الطالب وبيظهر في الخزينة كخروج نقدي في يومه.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleRefund}
            disabled={busy || !(refundForm.amount > 0) || !refundForm.reason.trim()}
            className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            {busy ? 'جاري التنفيذ...' : 'تأكيد الاسترداد'}
          </button>
          <button
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
          >
            تراجع
          </button>
        </div>
      </div>
    </Modal>
  );
}
