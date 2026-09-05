import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarClock, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import Modal from './ui/Modal';
import {
  renewEnrollment, getStudentInstallments, dbGetById, dbGetByIndex,
  Group, Course, Enrollment, PaymentMethod, RenewalInfo,
} from '../lib/db';
import { renewalInfo, effectiveMonthlyPrice, RENEWAL_STATE_LABEL } from '../lib/billing';
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
  /** بيستدعي بعد نجاح التجديد (لتحديث الصفحة) */
  onDone: () => void;
}

const STATE_STYLE: Record<RenewalInfo['state'], string> = {
  active: 'bg-green-50 text-green-700 border-green-100',
  expiring: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  expired: 'bg-red-50 text-red-700 border-red-100',
};

/**
 * نافذة تجديد/استكمال اشتراك طالب في مجموعة.
 * بتعرض حالة الاشتراك الحالي (ساري/قرب ينتهي/منتهي) والمتبقي القديم،
 * وبتسمح باختيار عدد الشهور، تاريخ بداية الدورة الجديدة، ودفعة فورية.
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
  const [notes, setNotes] = useState('');
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
        setMonths(Math.max(1, c?.durationMonths || 1));
        setStartDate(ri.nextStartDate);
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
  const totalAfter = Math.max(0, oldRemaining + newTotal - pay);
  const hasDiscount = !!(enrollment?.priceOverride || enrollment?.discountAmount || enrollment?.discountPercent);

  async function handleRenew() {
    if (!(months >= 1)) { notify.error('عدد الشهور لازم يكون 1 على الأقل'); return; }
    if (!dayjs(startDate).isValid()) { notify.error('تاريخ البداية غير صحيح'); return; }
    if (pay < 0) { notify.error('الدفعة لا يمكن أن تكون سالبة'); return; }
    setSaving(true);
    try {
      const r = await renewEnrollment({
        studentId, groupId, months, startDate,
        initialPayment: pay > 0 ? pay : undefined,
        paymentMethod: method,
        collectedBy: user?.id, collectedByName: user?.username,
        notes: notes.trim() || undefined,
        userId: user?.id, username: user?.username,
      });
      if (!r.success) { notify.error(r.error || 'حدث خطأ'); return; }
      notify.success(
        `تم تجديد اشتراك ${studentName} في ${group?.name || 'المجموعة'} — ${months} شهر` +
        (pay > 0 ? ` · محصّل ${formatCurrency(pay, currency)}` : '') +
        ` · المتبقي ${formatCurrency(r.remainingAfter ?? 0, currency)}`
      );
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'update', entity: 'enrollment', entityId: enrollment?.id || `${studentId}:${groupId}`,
        details: `تجديد اشتراك ${studentName} في ${group?.name || groupId}: ${months} شهر من ${startDate}` +
          (pay > 0 ? ` — دفعة ${pay} (${METHOD_LABEL[method]})` : '') +
          ` — دورة ${r.cycle}`,
      });
      onDone();
      onClose();
    } catch {
      notify.error('حدث خطأ أثناء التجديد');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';

  return (
    <Modal isOpen={open} onClose={onClose} title={`تجديد الاشتراك — ${studentName}`} size="md">
      {loading ? (
        <div className="py-8 text-center text-gray-400 animate-pulse">جاري التحميل...</div>
      ) : (
        <div className="space-y-4">
          {/* حالة الاشتراك الحالي */}
          <div className={`p-3 rounded-xl border text-sm ${info ? STATE_STYLE[info.state] : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center gap-2 mb-1">
              <CalendarClock size={16} />
              <span className="font-bold">{group?.name}</span>
              <span className="text-xs opacity-80">• {course?.name}</span>
              {info && (
                <span className="mr-auto text-xs font-bold px-2 py-0.5 rounded-full bg-white/70">
                  {RENEWAL_STATE_LABEL[info.state]}
                </span>
              )}
            </div>
            {info && info.periods > 0 ? (
              <p className="text-xs opacity-90">
                الاشتراك الحالي {info.periods} شهر، ينتهي يوم {info.endDate ? formatDate(info.endDate) : '—'}
                {typeof info.daysLeft === 'number' && (
                  info.daysLeft > 0 ? ` (باقي ${info.daysLeft} يوم)` : ` (منتهي من ${Math.abs(info.daysLeft)} يوم)`
                )}
                {enrollment?.renewalCount ? ` · اتجدد ${enrollment.renewalCount} مرة قبل كده` : ''}
              </p>
            ) : (
              <p className="text-xs opacity-90">مفيش أقساط مسجلة على المجموعة دي — التجديد هيبدأ خطة جديدة.</p>
            )}
            {oldRemaining > 0 && (
              <p className="text-xs mt-1 flex items-center gap-1 font-semibold">
                <AlertTriangle size={12} /> عليه متبقي قديم {formatCurrency(oldRemaining, currency)} — هيفضل مستحق وأي دفعة هتسدده الأول.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">عدد الشهور *</label>
              <input type="number" min={1} max={24} value={months}
                onChange={e => setMonths(Math.max(1, Math.floor(+e.target.value || 1)))} className={inputCls} />
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {[1, 2, 3, course?.durationMonths || 0].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(n => (
                  <button key={n} type="button" onClick={() => setMonths(n)}
                    className={`px-2 py-0.5 text-xs rounded-lg ${months === n ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {n === course?.durationMonths && n > 3 ? `مدة الكورس (${n})` : `${n} شهر`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">بداية الدورة الجديدة</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">
                {info?.state === 'active' ? 'تلقائياً بعد انتهاء الاشتراك الحالي' : 'تلقائياً النهاردة (الطالب منقطع)'}
              </p>
            </div>
          </div>

          {/* ملخص التسعير */}
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">السعر الشهري {hasDiscount && <span className="text-[11px] text-indigo-600">(بنفس خصم التسجيل)</span>}</span>
              <span className="font-semibold">{formatCurrency(monthlyPrice, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">إجمالي الدورة الجديدة ({months} شهر)</span>
              <span className="font-bold text-gray-900">{formatCurrency(newTotal, currency)}</span>
            </div>
            {oldRemaining > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">+ متبقي قديم</span>
                <span className="font-semibold text-red-600">{formatCurrency(oldRemaining, currency)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">دفعة عند التجديد</label>
              <input type="number" min={0} value={payment} placeholder="اختياري"
                onChange={e => setPayment(e.target.value === '' ? '' : Math.max(0, +e.target.value))} className={inputCls} />
              <div className="flex gap-1 mt-1.5 flex-wrap">
                <button type="button" onClick={() => setPayment(newTotal + oldRemaining)}
                  className="px-2 py-0.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">الكل</button>
                <button type="button" onClick={() => setPayment(monthlyPrice)}
                  className="px-2 py-0.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">شهر</button>
                <button type="button" onClick={() => setPayment('')}
                  className="px-2 py-0.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">بدون</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الدفع</label>
              <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={inputCls} disabled={pay <= 0}>
                {METHOD_ORDER.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="اختياري" className={inputCls} />
          </div>

          <p className="text-xs text-gray-500">
            المتبقي على المجموعة بعد التجديد:{' '}
            <strong className={totalAfter > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(totalAfter, currency)}</strong>
          </p>

          <div className="flex gap-3 pt-1">
            <button onClick={handleRenew} disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
              <RefreshCw size={16} /> {saving ? 'جاري التجديد...' : 'تأكيد التجديد'}
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
