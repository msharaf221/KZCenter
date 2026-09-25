import dayjs from 'dayjs';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { PaymentMethod } from '../domain/models';
import { useCommandTask } from '../hooks/useCommandTask';
import { useResourceDraft } from '../hooks/useResourceDraft';
import { METHOD_LABEL, METHOD_ORDER } from '../lib/cashbox';
import { notify } from '../lib/notifications';
import { formatCurrency, formatDate, getContrastColor } from '../lib/utils';
import { renewStudentSubscription } from '../services/commands/studentFinance';
import { loadRenewalDialog } from '../services/queries/enrollmentDialogs';
import Modal from './ui/Modal';
import ResourceError from './ui/ResourceError';

interface Props {
  open: boolean;
  studentId: string;
  studentName: string;
  groupId: string;
  onClose: () => void;
  /** بيستدعي بعد نجاح الفتح (لتحديث الصفحة) */
  onDone: () => void;
}

/**
 * تجديد اشتراك طالب في مجموعة (شهر جديد أو أكتر).
 * بسيطة: الشهر اللي هيتفتح + سعره + دفع دلوقتي كام. الباقي يفضل ظاهر لحد ما يجيبه.
 */
export default function RenewDialog(props: Props) {
  return props.open ? <RenewForm key={JSON.stringify([props.studentId, props.groupId])} {...props} /> : null;
}

function RenewForm({ open, studentId, studentName, groupId, onClose, onDone }: Props) {
  const { settings } = useApp();
  const { user } = useAuth();
  const task = useCommandTask();
  const saving = task.pending;
  const primaryColor = settings?.primaryColor || '#6366f1';
  const currency = settings?.currency;
  const query = useCallback(async () => ({ data: await loadRenewalDialog(studentId, groupId, settings?.upcomingDueDays), months: 1, payment: '' as number | '', method: 'cash' as PaymentMethod }), [studentId, groupId, settings?.upcomingDueDays]);
  const initial = { data: null as Awaited<ReturnType<typeof loadRenewalDialog>> | null, months: 1, payment: '' as number | '', method: 'cash' as PaymentMethod };
  const { value, setValue, ready, error, reload } = useResourceDraft(JSON.stringify([studentId, groupId]), query, initial);
  const { months, payment, method } = value;
  const { group, course, info, oldRemaining = 0, monthlyPrice = 0, startDate = '' } = value.data || {};
  const loading = !ready;
  const setMonths = (months: number) => setValue(current => ({ ...current, months }));
  const setPayment = (payment: number | '') => setValue(current => ({ ...current, payment }));
  const setMethod = (method: PaymentMethod) => setValue(current => ({ ...current, method }));
  const setStartDate = (startDate: string) => setValue(current => ({ ...current, data: current.data ? { ...current.data, startDate } : null }));

  const newTotal = Math.round(monthlyPrice * Math.max(1, months) * 100) / 100;
  const pay = typeof payment === 'number' ? payment : 0;
  const totalDue = oldRemaining + newTotal;
  const leftAfter = Math.max(0, totalDue - pay);
  const monthName = dayjs(startDate).isValid() ? dayjs(startDate).format('MMMM YYYY') : '';

  async function handleRenew() {
    if (!ready) return;
    const result = await task.run(() => renewStudentSubscription(user, { studentId, groupId, months, startDate, initialPayment: pay || undefined, paymentMethod: method }));
    if (!result || !task.isActive()) return;
    notify.success(`تم تجديد ${studentName} — ${months === 1 ? `شهر ${monthName}` : `${months} شهور`}` +
      (pay > 0 ? ` · دفع ${formatCurrency(pay, currency)}` : '') + ((result.remainingAfter ?? 0) > 0 ? ` · باقي ${formatCurrency(result.remainingAfter ?? 0, currency)}` : ' · خالص'));
    onDone(); onClose();
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <Modal isOpen={open} onClose={saving ? () => { } : onClose} title={`تجديد — ${studentName}`} size="sm">
      {error ? <ResourceError onRetry={reload} /> : loading ? (
        <div className="py-8 text-center text-gray-400 animate-pulse">جاري التحميل...</div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
            <p className="font-bold text-gray-900">{group?.name} <span className="text-xs font-normal text-gray-500">• {course?.name}</span></p>
            {info && info.periods > 0 && info.endDate && (
              <p className="text-xs text-gray-500 mt-0.5">
                {info.state === 'expired'
                  ? `آخر شهر اشتراك خلص ${formatDate(info.endDate)}`
                  : `الاشتراك حتى ${formatDate(info.endDate)}`}
              </p>
            )}
            {oldRemaining > 0 && (
              <p className="text-xs mt-1.5 flex items-center gap-1 font-semibold text-red-600">
                <AlertTriangle size={12} /> لسه عليه {formatCurrency(oldRemaining, currency)} من قبل كده
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الشهر يبدأ من</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">عدد الشهور</label>
              <select value={months} onChange={e => setMonths(+e.target.value)} className={inputCls}>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 1 ? 'شهر واحد' : `${n} شهور`}</option>)}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-gray-100 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">{months === 1 ? `شهر ${monthName}` : `${months} شهور × ${formatCurrency(monthlyPrice, currency)}`}</span>
              <span className="font-bold text-gray-900">{formatCurrency(newTotal, currency)}</span>
            </div>
            {oldRemaining > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">+ باقي قديم</span>
                <span className="font-semibold text-red-600">{formatCurrency(oldRemaining, currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-1">
              <span className="text-gray-700 font-semibold">المطلوب</span>
              <span className="font-bold text-gray-900">{formatCurrency(totalDue, currency)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">يدفع دلوقتي</label>
              <input type="number" min={0} value={payment} placeholder="0"
                onChange={e => setPayment(e.target.value === '' ? '' : Math.max(0, +e.target.value))} className={inputCls} />
              <div className="flex gap-1 mt-1.5 flex-wrap">
                <button type="button" onClick={() => setPayment(totalDue)}
                  className="px-2 py-0.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">الكل</button>
                <button type="button" onClick={() => setPayment(monthlyPrice)}
                  className="px-2 py-0.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">شهر</button>
                <button type="button" onClick={() => setPayment('')}
                  className="px-2 py-0.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">بعدين</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الدفع</label>
              <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={inputCls} disabled={pay <= 0}>
                {METHOD_ORDER.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </div>
          </div>

          <p className="text-sm text-center">
            {leftAfter > 0
              ? <>هيفضل عليه <strong className="text-red-600">{formatCurrency(leftAfter, currency)}</strong></>
              : <strong className="text-green-600">خالص ✓</strong>}
          </p>

          <div className="flex gap-3 pt-1">
            <button onClick={handleRenew} disabled={saving || !ready}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
              <RefreshCw size={16} /> {saving ? 'جاري الحفظ...' : 'تجديد'}
            </button>
            <button disabled={saving} onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
