/**
 * نافذة «تصفير المديونيات» — إبراء ذمة لبداية شهر جديد قبل التجديدات.
 *
 * النافذة مقصود فيها إنها **مخوّفة** عن قصد: العملية بتلغي أقساط (يعني بتصفّر
 * فلوس مستحقة) والتراجع عنها يدوي، فعشان كده:
 *  1) بتعرض ملخص بالأرقام قبل التنفيذ (كم طالب وكم قسط وكام فلوس).
 *  2) بتخيّر نطاق: كل المتبقي / المستحق والمتأخر بس.
 *  3) السبب إلزامي، ولازم كتابة كلمة «تصفير» للتأكيد.
 */
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Eraser, Loader2, Receipt, Users, Wallet } from 'lucide-react';
import Modal from './ui/Modal';
import {
  previewWriteOff,
  writeOffDebts,
  WRITE_OFF_SCOPE_LABEL,
  WRITE_OFF_SCOPE_HINT,
  WRITE_OFF_CONFIRM_WORD,
  WriteOffPreview,
  WriteOffResult,
  WriteOffScope,
} from '../lib/db';
import { formatCurrency } from '../lib/utils';

const SCOPES: WriteOffScope[] = ['due', 'all'];

/** تسامح مع المسافات والتطويل (ـ) في كلمة التأكيد */
function normalizeWord(value: string): string {
  return value.replace(/[\s\u0640]/g, '');
}

interface WriteOffDebtsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** بيتنادى بعد التنفيذ الناجح — الصفحة هي اللي بتسجّل في السجل وتحدّث القايمة */
  onDone: (info: { scope: WriteOffScope; reason: string; result: WriteOffResult }) => void;
  currency?: string;
}

export default function WriteOffDebtsDialog({
  isOpen,
  onClose,
  onDone,
  currency = 'EGP',
}: WriteOffDebtsDialogProps) {
  const [scope, setScope] = useState<WriteOffScope>('due');
  const [reason, setReason] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [preview, setPreview] = useState<WriteOffPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async (nextScope: WriteOffScope) => {
    setLoadingPreview(true);
    setError(null);
    try {
      setPreview(await previewWriteOff(nextScope));
    } catch (e) {
      console.error('previewWriteOff error:', e);
      setPreview(null);
      setError('تعذّر حساب ملخص التصفير');
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  // إعادة ضبط الحقول مع كل فتح (تغيير النطاق ما يمسحش اللي المستخدم كتبه)
  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setConfirmWord('');
    setError(null);
  }, [isOpen]);

  // معاينة النطاق المختار عند الفتح ومع كل تغيير نطاق
  useEffect(() => {
    if (!isOpen) return;
    void loadPreview(scope);
  }, [isOpen, scope, loadPreview]);

  const wordOk = normalizeWord(confirmWord) === normalizeWord(WRITE_OFF_CONFIRM_WORD);
  const hasTargets = (preview?.installmentsCount ?? 0) > 0;
  const canConfirm = hasTargets && reason.trim().length > 0 && wordOk && !saving && !loadingPreview;

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const result = await writeOffDebts(scope, reason.trim());
      if (!result.success) {
        setError(result.error || 'تعذّر تنفيذ التصفير');
        return;
      }
      onDone({ scope, reason: reason.trim(), result });
      // تحديث الملخص للوضع الجديد (الصفحة هي اللي بتقفل النافذة)
      void loadPreview(scope);
    } catch (e) {
      console.error('writeOffDebts error:', e);
      setError('حدث خطأ أثناء التصفير');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} title="تصفير المديونيات (إبراء ذمة)" size="md">
      <div className="space-y-5">
        {/* تحذير */}
        <div className="flex gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800 leading-relaxed">
            <p className="font-bold mb-1">عملية غير قابلة للتراجع التلقائي</p>
            <p>
              الأقساط الملغية مش هتترجع لوحدها. الدفعات المحصّلة نفسها <strong>مش هتتمسح</strong> —
              هتفضل مسجّلة بأرقام إيصالاتها، واللي اتدفع زيادة عن المستحق هيبقى{' '}
              <strong>رصيد دائن</strong> للطالب.
            </p>
          </div>
        </div>

        {/* نطاق التصفير */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">نطاق التصفير</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SCOPES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`text-right p-3 rounded-xl border transition-colors ${
                  scope === s
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-semibold ${scope === s ? 'text-indigo-700' : 'text-gray-800'}`}>
                  {WRITE_OFF_SCOPE_LABEL[s]}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{WRITE_OFF_SCOPE_HINT[s]}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ملخص */}
        <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
          {loadingPreview || !preview ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> جاري حساب الملخص...
            </div>
          ) : !hasTargets ? (
            <p className="text-sm text-gray-500 text-center py-2">
              🎉 لا توجد مديونيات مطابقة لهذا النطاق — مفيش حاجة تتصفّر
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">طلاب متأثرين</p>
                  <p className="text-sm font-bold text-gray-900" data-testid="writeoff-students">{preview.studentsCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">أقساط هتتلغي</p>
                  <p className="text-sm font-bold text-gray-900" data-testid="writeoff-installments">{preview.installmentsCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eraser size={16} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">المبلغ اللي هيتصفّر</p>
                  <p className="text-sm font-bold text-red-600" data-testid="writeoff-amount">{formatCurrency(preview.amount, currency)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">منه متأخرات</p>
                  <p className="text-sm font-bold text-orange-600" data-testid="writeoff-overdue">{formatCurrency(preview.overdueAmount, currency)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* السبب */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">السبب *</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="مثال: إبراء ذمة عن شهر أغسطس قبل تجديدات سبتمبر"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* تأكيد بالكلمة */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            اكتب كلمة «{WRITE_OFF_CONFIRM_WORD}» للتأكيد *
          </label>
          <input
            type="text"
            value={confirmWord}
            onChange={e => setConfirmWord(e.target.value)}
            placeholder={WRITE_OFF_CONFIRM_WORD}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{error}</p>
        )}
      </div>

      <div className="flex gap-3 mt-5">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'جاري التصفير...' : 'تأكيد التصفير'}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          إلغاء
        </button>
      </div>
    </Modal>
  );
}
