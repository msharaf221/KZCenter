import Modal from '../../components/ui/Modal';
import { useApp } from '../../contexts/AppContext';
import type { Payment } from '../../domain/models';
import { formatCurrency } from '../../lib/utils';

interface Props {
  payment: Payment | null;
  studentName: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  busy: boolean;
}

export default function VoidPaymentDialog({
  payment: voidTarget,
  studentName,
  reason: voidReason,
  onReasonChange: setVoidReason,
  onClose,
  onConfirm: handleVoid,
  busy,
}: Props) {
  const { settings } = useApp();

  return (
    <Modal isOpen={!!voidTarget} onClose={() => { if (!busy) onClose(); }} title="إلغاء الدفعة">
      <div className="space-y-4">
        <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">الإيصال</span>
            <span className="font-mono font-bold" dir="ltr">
              {voidTarget?.receiptNo || '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">الطالب</span>
            <span className="font-bold">{studentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">المبلغ</span>
            <span className="font-bold">{formatCurrency(voidTarget?.amount || 0, settings?.currency)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          الإلغاء مش حذف: الدفعة بتفضل في السجل برقمها وسبب الإلغاء، لكنها ما بتتحسبش في أي مجموع والمبلغ هيرجع يظهر
          «باقي» على الطالب تاني.
        </p>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">سبب الإلغاء *</label>
          <textarea
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            rows={2}
            placeholder="مثال: تسجيل بالخطأ / إلغاء اشتراك / تعديل مبلغ"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleVoid}
            disabled={busy || !voidReason.trim()}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'جاري التنفيذ...' : 'إلغاء الدفعة'}
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
