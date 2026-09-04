/**
 * الخزينة والتقفيل اليومي
 *
 * بتجاوب على أسئلة اليوم: محصّل كام؟ بأنهي طريقة؟ من مين؟ المفروض في الدرج كام؟
 * والمعدود فعلياً كام؟ → عجز/زيادة.
 */
import { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, Minus, Printer, Lock, Unlock, TrendingUp, AlertTriangle, Users } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { StatCard } from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import {
  getCashSessionByDate, getCashSessions, openCashSession, closeCashSession,
  getDayTotals, summarizePeriod, METHOD_LABEL, METHOD_ORDER, DayTotals,
} from '../lib/cashbox';
import type { CashSession } from '../lib/db';
import { formatCurrency, formatDate, dayjs } from '../lib/utils';
import { printTable } from '../lib/printing';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { can } from '../lib/permissions';

export default function TreasuryPage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const currency = settings?.currency;

  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [totals, setTotals] = useState<DayTotals | null>(null);
  const [session, setSession] = useState<CashSession | null>(null);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [countedCash, setCountedCash] = useState(0);
  const [notes, setNotes] = useState('');

  // ملخص الشهر الحالي
  const [monthSummary, setMonthSummary] = useState<Awaited<ReturnType<typeof summarizePeriod>> | null>(null);

  const canEdit = can(user?.role, 'treasury', 'edit') || can(user?.role, 'treasury', 'money');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const existing = await getCashSessionByDate(date);
      setSession(existing);

      const t = await getDayTotals(date, existing?.openingBalance || 0);
      setTotals(t);

      const from = dayjs(date).startOf('month').format('YYYY-MM-DD');
      const to = dayjs(date).endOf('month').format('YYYY-MM-DD');
      setMonthSummary(await summarizePeriod(from, to));

      setHistory(await getCashSessions(30));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  async function handleOpen() {
    const r = await openCashSession({
      date,
      openingBalance,
      userId: user?.id,
      username: user?.username,
      notes: notes || undefined,
    });
    if (!r.success) { notify.error(r.error || 'تعذّر فتح الوردية'); return; }

    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'create', entity: 'cashbox', entityId: r.session?.id,
      details: `فتح وردية خزينة ${date} برصيد أول ${openingBalance}`,
    });
    notify.success('تم فتح الوردية');
    setShowOpen(false); setOpeningBalance(0); setNotes('');
    await load();
  }

  async function handleClose() {
    if (!session) return;
    const r = await closeCashSession({
      sessionId: session.id,
      countedCash,
      userId: user?.id,
      username: user?.username,
      notes: notes || undefined,
    });
    if (!r.success) { notify.error(r.error || 'تعذّر التقفيل'); return; }

    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'update', entity: 'cashbox', entityId: session.id,
      details: `تقفيل خزينة ${date}: مفروض ${r.expectedCash} — معدود ${r.countedCash} — فرق ${r.difference}`,
    });

    if ((r.difference || 0) !== 0) {
      notify.warning(`فيه فرق ${(r.difference || 0) > 0 ? 'زيادة' : 'عجز'}: ${formatCurrency(Math.abs(r.difference || 0), currency)}`);
    } else {
      notify.success('تم التقفيل — الصندوق مطابق تماماً ✅');
    }
    setShowClose(false); setCountedCash(0); setNotes('');
    await load();
  }

  function handlePrint() {
    if (!totals) return;
    const rows = [
      ...METHOD_ORDER.map(m => ({
        item: METHOD_LABEL[m],
        count: '—',
        amount: totals.byMethod[m] || 0,
      })),
      { item: 'استردادات (خارج من الدرج)', count: '—', amount: -totals.refunds },
      { item: 'مصروفات نقدية', count: '—', amount: -totals.cashExpenses },
      { item: 'رصيد أول المدة', count: '—', amount: session?.openingBalance || 0 },
      { item: 'المفروض في الدرج', count: `${totals.paymentsCount} دفعة`, amount: totals.expectedCash },
      ...(session?.status === 'closed' ? [{
        item: 'المعدود فعلياً',
        count: session.closedByName || '—',
        amount: session.countedCash || 0,
      }, {
        item: session.difference && session.difference < 0 ? 'عجز' : 'زيادة',
        count: '—',
        amount: session.difference || 0,
      }] : []),
    ];

    printTable({
      title: 'تقفيل الخزينة',
      subtitle: formatDate(date, 'YYYY/MM/DD'),
      settings,
      rows,
      columns: [
        { key: 'item', label: 'البند' },
        { key: 'count', label: 'ملاحظات', align: 'center' },
        { key: 'amount', label: 'المبلغ', format: 'currency' },
      ],
      meta: [
        { label: 'التاريخ', value: formatDate(date) },
        { label: 'الوردية', value: session ? (session.status === 'open' ? 'مفتوحة' : 'متقفلة') : 'لم تُفتح' },
        { label: 'بواسطة', value: user?.username || '—' },
      ],
      totals: [
        { label: 'إجمالي المحصّل', value: formatCurrency(totals.collected, currency) },
        { label: 'صافي الدرج', value: formatCurrency(totals.expectedCash, currency) },
      ],
      footer: 'التقفيل معتمد من نظام المركز — يُحفظ تلقائياً في سجل الورديات',
    });
  }

  const diff = session?.status === 'closed' ? (session.difference || 0) : 0;

  return (
    <Layout title="الخزينة والتقفيل اليومي">
      <div className="space-y-5">
        {/* شريط التاريخ والإجراءات */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <button onClick={() => setDate(dayjs().subtract(1, 'day').format('YYYY-MM-DD'))}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">أمس</button>
            <button onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">النهاردة</button>
          </div>

          <div className="mr-auto flex flex-wrap gap-2">
            {canEdit && !session && (
              <button onClick={() => setShowOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
                <Unlock size={16} /> فتح وردية
              </button>
            )}
            {canEdit && session?.status === 'open' && (
              <button onClick={() => { setCountedCash(totals?.expectedCash || 0); setShowClose(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                <Lock size={16} /> تقفيل الوردية
              </button>
            )}
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
              <Printer size={16} /> طباعة التقفيل
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
        ) : !totals ? null : (
          <>
            {/* الكروت */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="إجمالي محصّل اليوم" value={formatCurrency(totals.collected, currency)}
                icon={<Wallet size={22} />} color="#6366f1" subtitle={`${totals.paymentsCount} دفعة`} />
              <StatCard title="المفروض في الدرج (نقدي)" value={formatCurrency(totals.expectedCash, currency)}
                icon={<TrendingUp size={22} />} color="#0ea5e9"
                subtitle={`رصيد أول المدة: ${formatCurrency(session?.openingBalance || 0, currency)}`} />
              <StatCard title="المعدود فعلياً"
                value={session?.status === 'closed' ? formatCurrency(session.countedCash || 0, currency) : '—'}
                icon={<Users size={22} />} color="#8b5cf6"
                subtitle={session?.status === 'closed' ? `قُفلت بواسطة ${session.closedByName || '—'}` : 'الوردية لسه مفتوحة'} />
              <StatCard title={diff < 0 ? 'عجز في الصندوق' : diff > 0 ? 'زيادة في الصندوق' : 'مطابقة الصندوق'}
                value={session?.status === 'closed' ? formatCurrency(Math.abs(diff), currency) : '—'}
                icon={<AlertTriangle size={22} />}
                color={diff === 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#f59e0b'}
                subtitle={session?.status === 'closed' ? (diff === 0 ? 'تمام يا كبير ✅' : 'لازم يتراجع') : 'بعد التقفيل'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* التحصيل بطريقة الدفع */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-base font-bold text-gray-900 mb-4">التحصيل بطريقة الدفع</h3>
                <div className="space-y-2.5">
                  {METHOD_ORDER.map(m => {
                    const amount = totals.byMethod[m] || 0;
                    const pct = totals.collected > 0 ? (amount / totals.collected) * 100 : 0;
                    return (
                      <div key={m}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium">{METHOD_LABEL[m]}</span>
                          <span className="text-gray-900 font-bold">{formatCurrency(amount, currency)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: settings?.primaryColor || '#6366f1' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">استردادات</span>
                    <span className="font-bold text-red-600">-{formatCurrency(totals.refunds, currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">مصروفات نقدية</span>
                    <span className="font-bold text-orange-600">-{formatCurrency(totals.cashExpenses, currency)}</span></div>
                </div>
              </div>

              {/* تحصيل كل موظف */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-base font-bold text-gray-900 mb-4">تحصيل كل موظف (اليوم)</h3>
                {totals.byCollector.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">مفيش دفعات اتسجلت النهاردة</p>
                ) : (
                  <div className="space-y-2">
                    {totals.byCollector.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                            <p className="text-xs text-gray-500">{c.count} دفعة</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-green-700">{formatCurrency(c.amount, currency)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {monthSummary && (
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-500 mb-2">ملخص شهر {dayjs(date).format('MMMM YYYY')}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-green-50 rounded-xl">
                        <p className="text-[11px] text-gray-500">محصّل</p>
                        <p className="text-sm font-bold text-green-700">{formatCurrency(monthSummary.collected, currency)}</p>
                      </div>
                      <div className="p-2 bg-red-50 rounded-xl">
                        <p className="text-[11px] text-gray-500">مصروفات</p>
                        <p className="text-sm font-bold text-red-700">{formatCurrency(monthSummary.expenses, currency)}</p>
                      </div>
                      <div className="p-2 bg-indigo-50 rounded-xl">
                        <p className="text-[11px] text-gray-500">صافي</p>
                        <p className="text-sm font-bold text-indigo-700">{formatCurrency(monthSummary.net, currency)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* سجل الورديات */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-base font-bold text-gray-900 mb-4">سجل الورديات (آخر 30)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">اليوم</th>
                      <th className="pb-2 font-medium">الحالة</th>
                      <th className="pb-2 font-medium">رصيد أول المدة</th>
                      <th className="pb-2 font-medium">المفروض</th>
                      <th className="pb-2 font-medium">المعدود</th>
                      <th className="pb-2 font-medium">الفرق</th>
                      <th className="pb-2 font-medium">قفلها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-400">مفيش ورديات مسجلة لسه</td></tr>
                    ) : history.map(s => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2.5 font-medium text-gray-900">{formatDate(s.date)}</td>
                        <td className="py-2.5">
                          <Badge status={s.status === 'closed' ? 'paid' : 'pending'}
                            label={s.status === 'closed' ? 'متقفلة' : 'مفتوحة'} />
                        </td>
                        <td className="py-2.5 text-gray-600">{formatCurrency(s.openingBalance, currency)}</td>
                        <td className="py-2.5 text-gray-600">{s.expectedCash !== undefined ? formatCurrency(s.expectedCash, currency) : '—'}</td>
                        <td className="py-2.5 text-gray-600">{s.countedCash !== undefined ? formatCurrency(s.countedCash, currency) : '—'}</td>
                        <td className={`py-2.5 font-bold ${
                          (s.difference || 0) === 0 ? 'text-gray-400'
                            : (s.difference || 0) < 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {s.difference !== undefined ? formatCurrency(s.difference, currency) : '—'}
                        </td>
                        <td className="py-2.5 text-gray-600 text-xs">{s.closedByName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* فتح وردية */}
      <Modal isOpen={showOpen} onClose={() => setShowOpen(false)} title={`فتح وردية — ${formatDate(date)}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              <Plus size={14} className="inline ml-1" /> رصيد أول المدة في الدرج (نقدي)
            </label>
            <input type="number" min={0} value={openingBalance}
              onChange={e => setOpeningBalance(+e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-xs text-gray-400 mt-1">الفلوس اللي بدأت بيها الوردية قبل أي تحصيل</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleOpen}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">فتح الوردية</button>
            <button onClick={() => setShowOpen(false)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
          </div>
        </div>
      </Modal>

      {/* تقفيل وردية */}
      <Modal isOpen={showClose} onClose={() => setShowClose(false)} title={`تقفيل وردية — ${formatDate(date)}`}>
        {totals && (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 rounded-xl">
              <p className="text-xs text-indigo-700 font-medium mb-1">المفروض في الدرج (محسوب تلقائياً)</p>
              <p className="text-2xl font-bold text-indigo-900">{formatCurrency(totals.expectedCash, currency)}</p>
              <p className="text-xs text-indigo-600 mt-2 leading-relaxed">
                = رصيد أول المدة {formatCurrency(session?.openingBalance || 0, currency)}
                {' '}+ نقدي محصّل {formatCurrency(totals.byMethod.cash, currency)}
                {' '}− استردادات {formatCurrency(totals.refunds, currency)}
                {' '}− مصروفات نقدية {formatCurrency(totals.cashExpenses, currency)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                <Minus size={14} className="inline ml-1" /> المعدود فعلياً في الدرج
              </label>
              <input type="number" min={0} value={countedCash}
                onChange={e => setCountedCash(+e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              {countedCash > 0 && (
                <p className={`text-xs mt-1 font-bold ${countedCash === totals.expectedCash ? 'text-green-600' : 'text-red-600'}`}>
                  الفرق: {formatCurrency(countedCash - totals.expectedCash, currency)}
                  {countedCash === totals.expectedCash ? ' (مطابق ✅)' : countedCash < totals.expectedCash ? ' (عجز ⚠️)' : ' (زيادة)'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات التقفيل</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="سبب العجز/الزيادة لو فيه..."
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handleClose}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">تقفيل وحفظ</button>
              <button onClick={() => setShowClose(false)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
