import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import Modal from './ui/Modal';
import {
  renewEnrollment, getStudentInstallments, dbGetById, dbGetByIndex,
  Group, Course, Enrollment, PaymentMethod, RenewalInfo,
} from '../lib/db';
import { renewalInfo, effectiveMonthlyPrice } from '../lib/billing';
import { METHOD_LABEL, METHOD_ORDER } from '../lib/cashbox';
import { formatCurrency, formatDate, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';

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
 * فتح شهر جديد لطالب في مجموعة (التجديد).
 * بسيطة: الشهر اللي هيتفتح + سعره + دفع دلوقتي كام. الباقي يفضل ظاهر لحد ما يجيبه.
 */
export default function RenewDialog({ open, studentId, studentName, groupId, onClose, onDone }: Props) {
  const { settings } = useApp();
  const { user } = useAuth();
  const primaryColor = settings?.primaryColor || '#6366f1';
  const currency = settings?.currency;

  const [group, setGroup] = useState<Group | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [info, setInfo] = useState<RenewalInfo | null>(null);
  const [oldRemaining, setOldRemaining] = useState(0);
  const [loading, setLoading] = useState(true);

  const [months, setMonths] = useState(1);
  const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [payment, setPayment] = useState<number | ''>('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const g = await dbGetById<Group>('groups', groupId);
        const c = g ? await dbGetById<Course>('courses', g.courseId) : null;
        const ens = (await dbGetByIndex<Enrollment>('enrollments', 'by-studentGroup', [studentId, groupId]))
          .sort((a, b) => (b.enrolledAt || '').localeCompare(a.enrolledAt || ''));
        const en = ens.find(e => e.status === 'active') || ens[0] || null;
        const insts = (await getStudentInstallments(studentId)).filter(i => i.groupId === groupId);
        const ri = renewalInfo(insts, dayjs().format('YYYY-MM-DD'), settings?.upcomingDueDays ?? 7);
        const remainingOld = insts
          .filter(i => i.status !== 'cancelled')
          .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0);
        if (cancelled) return;
        setGroup(g || null);
        setCourse(c || null);
        setEnrollment(en);
        setInfo(ri);
        setOldRemaining(Math.round(remainingOld * 100) / 100);
        setMonths(1);
        setStartDate(ri.nextStartDate);
        setPayment('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, studentId, groupId, settings?.upcomingDueDays]);

  const monthlyPrice = useMemo(() => effectiveMonthlyPrice({
    coursePrice: course?.price || 0,
    priceOverride: enrollment?.priceOverride,
    discountAmount: enrollment?.discountAmount,
    discountPercent: enrollment?.discountPercent,
  }), [course, enrollment]);

  const newTotal = Math.round(monthlyPrice * Math.max(1, months) * 100) / 100;
  const pay = typeof payment === 'number' ? payment : 0;
  const totalDue = oldRemaining + newTotal;
  const leftAfter = Math.max(0, totalDue - pay);
  const monthName = dayjs(startDate).isValid() ? dayjs(startDate).format('MMMM YYYY') : '';

  async function handleRenew() {
    if (!dayjs(startDate).isValid()) { notify.error('التاريخ غير صحيح'); return; }
    if (pay < 0) { notify.error('المبلغ لا يمكن أن يكون سالباً'); return; }
    setSaving(true);
    try {
      const r = await renewEnrollment({
        studentId, groupId, months, startDate,
        initialPayment: pay > 0 ? pay : undefined,
        paymentMethod: method,
        collectedBy: user?.id, collectedByName: user?.username,
        userId: user?.id, username: user?.username,
      });
      if (!r.success) { notify.error(r.error || 'حدث خطأ'); return; }
      notify.success(
        `اتفتح ${months === 1 ? `شهر ${monthName}` : `${months} شهور`} لـ ${studentName}` +
        (pay > 0 ? ` · دفع ${formatCurrency(pay, currency)}` : '') +
        ((r.remainingAfter ?? 0) > 0 ? ` · باقي ${formatCurrency(r.remainingAfter ?? 0, currency)}` : ' · خالص')
      );
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'update', entity: 'enrollment', entityId: enrollment?.id || `${studentId}:${groupId}`,
        details: `فتح ${months} شهر لـ ${studentName} في ${group?.name || groupId} من ${startDate}` +
          (pay > 0 ? ` — دفعة ${pay} (${METHOD_LABEL[method]})` : ''),
      });
      onDone();
      onClose();
    } catch {
      notify.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <Modal isOpen={open} onClose={onClose} title={`شهر جديد — ${studentName}`} size="sm">
      {loading ? (
        <div className="py-8 text-center text-gray-400 animate-pulse">جاري التحميل...</div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">
            <p className="font-bold text-gray-900">{group?.name} <span className="text-xs font-normal text-gray-500">• {course?.name}</span></p>
            {info && info.periods > 0 && info.endDate && (
              <p className="text-xs text-gray-500 mt-0.5">
                {info.state === 'expired'
                  ? `آخر شهر مدفوع خلص ${formatDate(info.endDate)}`
                  : `مدفوع حتى ${formatDate(info.endDate)}`}
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
            <button onClick={handleRenew} disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
              <RefreshCw size={16} /> {saving ? 'جاري الحفظ...' : 'تأكيد'}
            </button>
            <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
