import dayjs from 'dayjs';
import { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCommandTask } from '../../hooks/useCommandTask';
import { notify } from '../../lib/notifications';
import { formatCurrency, getContrastColor } from '../../lib/utils';
import { collectStudentPayment } from '../../services/commands/studentFinance';

export interface QuickCollectTarget {
  studentId: string;
  studentName: string;
  remaining: number;
  groupId?: string;
  groupName?: string;
  overdueAmount?: number;
}

interface QuickCollectDialogProps {
  isOpen: boolean;
  target: QuickCollectTarget | null;
  onClose: () => void;
  onSuccess: () => Promise<unknown> | void;
}

export default function QuickCollectDialog({
  isOpen,
  target,
  onClose,
  onSuccess,
}: QuickCollectDialogProps) {
  const task = useCommandTask();
  const { settings } = useApp();
  const { user } = useAuth();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [payNotes, setPayNotes] = useState('');

  useEffect(() => {
    if (target) {
      setPayAmount(target.remaining);
      setPayDate(dayjs().format('YYYY-MM-DD'));
      setPayNotes('');
    }
  }, [target]);

  if (!target) return null;

  const saving = task.pending;
  const remainingAfter = Math.max(0, target.remaining - (payAmount || 0));

  async function handleCollect() {
    if (!target) return;
    if (!(payAmount > 0)) {
      notify.error('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }
    if (payAmount > target.remaining) {
      notify.error(`المبلغ أكبر من المتبقي (${formatCurrency(target.remaining, settings?.currency)})`);
      return;
    }

    await task.run(async () => {
      const result = await collectStudentPayment(user, {
        studentId: target.studentId,
        groupId: target.groupId,
        amount: payAmount,
        date: payDate,
        notes: payNotes.trim() || undefined,
        method: 'cash',
        collectedBy: user?.id,
        collectedByName: user?.username,
      });

      if (!result.success) {
        notify.error(result.error || 'حدث خطأ');
        return;
      }

      notify.success(`تم تحصيل ${formatCurrency(payAmount, settings?.currency)} للطالب ${target.studentName}`);
      onClose();
      await onSuccess();
    });
  }

  const title = `تحصيل دفعة — ${target.groupName ? `${target.studentName} (${target.groupName})` : target.studentName}`;

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!saving) onClose(); }} title={title} size="md">
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
          <div className="flex justify-between mb-1">
            <span className="text-gray-500">المتبقي على {target.groupName ? 'المجموعة' : 'الطالب'}</span>
            <span className="font-bold text-red-600">{formatCurrency(target.remaining, settings?.currency)}</span>
          </div>
          <p className="text-xs text-gray-400">تقدر تحصّل الباقي كله أو جزء منه — والباقي يفضل ظاهر لحد ما يجيبه.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المحصّل *</label>
          <input
            type="number"
            min={0}
            max={target.remaining}
            value={payAmount || ''}
            onChange={e => setPayAmount(+e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => setPayAmount(target.remaining)}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              المتبقي كله
            </button>
            <button
              type="button"
              onClick={() => setPayAmount(Math.round(target.remaining / 2))}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              نص المتبقي
            </button>
            {target.overdueAmount !== undefined && target.overdueAmount > 0 && (
              <button
                type="button"
                onClick={() => setPayAmount(target.overdueAmount!)}
                className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                قيمة المتأخرات
              </button>
            )}
            <button
              type="button"
              onClick={() => setPayAmount(0)}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              تصفير
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
          <input
            type="date"
            value={payDate}
            onChange={e => setPayDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
          <input
            type="text"
            value={payNotes}
            onChange={e => setPayNotes(e.target.value)}
            placeholder="اختياري"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none"
          />
        </div>

        <p className="text-xs text-gray-500">
          المتبقي بعد التحصيل:{' '}
          <strong className="text-gray-800">
            {formatCurrency(remainingAfter, settings?.currency)}
          </strong>
        </p>
      </div>

      <div className="flex gap-3 mt-5">
        <button
          onClick={handleCollect}
          disabled={saving}
          className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
        >
          {saving ? 'جاري الحفظ...' : 'تأكيد التحصيل'}
        </button>
        <button
          disabled={saving}
          onClick={onClose}
          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200"
        >
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
