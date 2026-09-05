import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Search, Download, MessageCircle, Eye, Receipt,
  Users, TrendingDown, Clock, DollarSign,
} from 'lucide-react';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import { getDebtors, recordInstallmentPayment, markOverdueInstallments, DebtorRow } from '../lib/db';
import { formatDate, formatCurrency, getWhatsAppLink, toCSV, downloadCSV, getContrastColor } from '../lib/utils';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import { refreshDebtAlert } from '../lib/debtAlerts';
import dayjs from 'dayjs';

type FilterKey = 'all' | 'overdue' | 'neverPaid' | 'suspended';
type SortKey = 'remaining' | 'overdue' | 'oldestPayment' | 'name';

export default function DebtorsPage() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const [debtors, setDebtors] = useState<DebtorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('remaining');

  const [payTarget, setPayTarget] = useState<DebtorRow | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await markOverdueInstallments();   // تحديث حالة الأقساط المتأخرة قبل العرض
      const rows = await getDebtors();
      setDebtors(rows);
      void refreshDebtAlert(true);       // تحديث عدّاد السايدبار والداشبورد
    } catch (e) {
      console.error('Debtors load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = debtors
    .filter(d => {
      const q = search.trim().toLowerCase();
      if (q && !d.name.toLowerCase().includes(q) && !d.parentPhone.includes(q)) return false;
      if (filter === 'overdue') return d.overdueCount > 0;
      if (filter === 'neverPaid') return d.daysSinceLastPayment === null;
      if (filter === 'suspended') return d.status === 'suspended';
      return true;
    })
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ar');
      if (sort === 'overdue') return b.overdueAmount - a.overdueAmount || b.remaining - a.remaining;
      if (sort === 'oldestPayment') {
        const av = a.daysSinceLastPayment ?? Number.MAX_SAFE_INTEGER;
        const bv = b.daysSinceLastPayment ?? Number.MAX_SAFE_INTEGER;
        return bv - av;
      }
      return b.remaining - a.remaining;
    });

  const totals = {
    count: rows.length,
    remaining: rows.reduce((s, d) => s + d.remaining, 0),
    overdueAmount: rows.reduce((s, d) => s + d.overdueAmount, 0),
    overdueCount: rows.reduce((s, d) => s + d.overdueCount, 0),
    neverPaid: rows.filter(d => d.daysSinceLastPayment === null).length,
  };

  function reminderText(d: DebtorRow) {
    const center = settings?.centerName || 'المركز';
    const groups = d.groups.map(g => g.groupName).join('، ');
    return `السلام عليكم، نود تذكيركم بأن الباقي على الطالب/ة ${d.name} هو ${d.remaining} ${settings?.currency || ''}${groups ? ` (${groups})` : ''}. برجاء السداد في أقرب وقت. ${center}`;
  }

  function exportCSV() {
    const csv = toCSV(
      rows.map(d => ({
        name: d.name,
        parentPhone: d.parentPhone,
        groups: d.groups.map(g => g.groupName).join(' | '),
        owed: d.owed,
        paid: d.paid,
        remaining: d.remaining,
        overdueCount: d.overdueCount,
        overdueAmount: d.overdueAmount,
        lastPayment: d.lastPaymentDate ? formatDate(d.lastPaymentDate) : 'لم يدفع بعد',
        days: d.daysSinceLastPayment ?? '',
      })),
      [
        { key: 'name', label: 'الطالب' },
        { key: 'parentPhone', label: 'هاتف ولي الأمر' },
        { key: 'groups', label: 'المجموعات' },
        { key: 'owed', label: 'المطلوب' },
        { key: 'paid', label: 'المدفوع' },
        { key: 'remaining', label: 'المتبقي' },
        { key: 'overdueCount', label: 'شهور متأخرة' },
        { key: 'overdueAmount', label: 'قيمة المتأخرات' },
        { key: 'lastPayment', label: 'آخر دفعة' },
        { key: 'days', label: 'أيام من آخر دفعة' },
      ]
    );
    downloadCSV(csv, 'debtors.csv');
    notify.success('تم تصدير المديونيات');
  }

  function openPay(d: DebtorRow) {
    setPayTarget(d);
    setPayAmount(d.remaining);
    setPayDate(dayjs().format('YYYY-MM-DD'));
    setPayNotes('');
  }

  async function handleCollect() {
    if (!payTarget) return;
    if (!(payAmount > 0)) { notify.error('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (payAmount > payTarget.remaining) {
      notify.error(`المبلغ أكبر من المتبقي (${formatCurrency(payTarget.remaining, settings?.currency)})`);
      return;
    }
    setSaving(true);
    try {
      const result = await recordInstallmentPayment({
        studentId: payTarget.studentId,
        amount: payAmount,
        date: payDate,
        notes: payNotes.trim() || `تحصيل من صفحة المديونيات — ${payTarget.name}`,
      });
      if (!result.success) { notify.error(result.error || 'حدث خطأ'); return; }
      notify.success(
        `تم تحصيل ${formatCurrency(payAmount, settings?.currency)} من ${payTarget.name} — المتبقي ${formatCurrency(result.remainingAfter ?? 0, settings?.currency)}`
      );
      setPayTarget(null);
      await load();
    } catch {
      notify.error('حدث خطأ أثناء التحصيل');
    } finally {
      setSaving(false);
    }
  }

  const FILTERS: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: debtors.length },
    { key: 'overdue', label: 'عليهم متأخرات', count: debtors.filter(d => d.overdueCount > 0).length },
    { key: 'neverPaid', label: 'لم يدفعوا بعد', count: debtors.filter(d => d.daysSinceLastPayment === null).length },
    { key: 'suspended', label: 'متوقفون', count: debtors.filter(d => d.status === 'suspended').length },
  ];

  return (
    <Layout title="المديونيات والتنبيهات">
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500 flex items-center gap-1.5"><Users size={14} /> طلاب عليهم مبالغ</p>
            <p className="text-2xl font-bold text-gray-900">{totals.count}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500 flex items-center gap-1.5"><DollarSign size={14} /> إجمالي المتبقي</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totals.remaining, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500 flex items-center gap-1.5"><AlertTriangle size={14} /> متأخرات</p>
            <p className="text-2xl font-bold text-orange-500">{totals.overdueCount}</p>
            <p className="text-xs text-gray-400 mt-1">{formatCurrency(totals.overdueAmount, settings?.currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500 flex items-center gap-1.5"><Clock size={14} /> لم يدفعوا بعد</p>
            <p className="text-2xl font-bold text-gray-900">{totals.neverPaid}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48 relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو هاتف ولي الأمر..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            <div className="flex flex-wrap gap-1 bg-gray-50 rounded-xl p-1">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === f.key ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  style={filter === f.key ? { backgroundColor: primaryColor, color: getContrastColor(primaryColor) } : {}}>
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none bg-white">
              <option value="remaining">الترتيب: الأكبر متبقياً</option>
              <option value="overdue">الترتيب: الأكبر متأخرات</option>
              <option value="oldestPayment">الترتيب: الأقدم دفعة</option>
              <option value="name">الترتيب: بالاسم</option>
            </select>

            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
              <Download size={16} /> تصدير
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">الطالب</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المجموعات</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المطلوب</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المدفوع</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">المتبقي</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">التأخير</th>
                  <th className="p-4 text-right text-xs font-semibold text-gray-600 uppercase">آخر دفعة</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-600 uppercase">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={8} className="p-8 text-center">
                    <div className="animate-spin w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto" />
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">
                    {debtors.length === 0 ? '🎉 لا توجد مديونيات — كل الطلاب مسددين' : 'لا نتائج مطابقة للفلتر'}
                  </td></tr>
                ) : rows.map(d => (
                  <tr key={d.studentId} className={`hover:bg-gray-50 transition-colors ${d.overdueCount > 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="p-4">
                      <button onClick={() => navigate(`/students/${d.studentId}`)} className="text-right group">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600">{d.name}</p>
                        <p className="text-xs text-gray-500">{d.parentPhone}</p>
                      </button>
                      {d.status === 'suspended' && (
                        <span className="inline-block mt-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">متوقف</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-gray-600 max-w-[220px]">
                      {d.groups.map(g => (
                        <div key={g.groupId} className="truncate">
                          {g.groupName}
                          <span className="text-gray-400"> • {formatCurrency(g.remaining, settings?.currency)}</span>
                        </div>
                      ))}
                    </td>
                    <td className="p-4 text-sm text-gray-700">{formatCurrency(d.owed, settings?.currency)}</td>
                    <td className="p-4 text-sm text-green-600">{formatCurrency(d.paid, settings?.currency)}</td>
                    <td className="p-4 text-sm font-bold text-red-600">{formatCurrency(d.remaining, settings?.currency)}</td>
                    <td className="p-4">
                      {d.overdueCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-600">
                          <AlertTriangle size={12} /> متأخر {formatCurrency(d.overdueAmount, settings?.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {d.lastPaymentDate ? (
                        <>
                          {formatDate(d.lastPaymentDate)}
                          <span className="block text-gray-400">من {d.daysSinceLastPayment} يوم</span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-600 font-medium">
                          <TrendingDown size={12} /> لم يدفع بعد
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openPay(d)}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="تحصيل دفعة">
                          <Receipt size={15} />
                        </button>
                        {d.parentPhone && (
                          <a href={getWhatsAppLink(d.parentPhone, reminderText(d))} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="تذكير عبر واتساب">
                            <MessageCircle size={15} />
                          </a>
                        )}
                        <button onClick={() => navigate(`/students/${d.studentId}`)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-colors" title="ملف الطالب">
                          <Eye size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* نافذة التحصيل */}
      {payTarget && (
        <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title={`تحصيل دفعة — ${payTarget.name}`} size="md">
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">المطلوب</span>
                <span className="font-bold">{formatCurrency(payTarget.owed, settings?.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">المدفوع</span>
                <span className="font-bold text-green-600">{formatCurrency(payTarget.paid, settings?.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1">
                <span className="text-gray-500">المتبقي</span>
                <span className="font-bold text-red-600">{formatCurrency(payTarget.remaining, settings?.currency)}</span>
              </div>
              {payTarget.groups.length > 0 && (
                <p className="text-xs text-gray-400 pt-1">{payTarget.groups.map(g => g.groupName).join('، ')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المحصّل *</label>
              <input type="number" min={0} max={payTarget.remaining} value={payAmount || ''}
                onChange={e => setPayAmount(+e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setPayAmount(payTarget.remaining)}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">المتبقي كله</button>
                <button type="button" onClick={() => setPayAmount(Math.round(payTarget.remaining / 2))}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">نص المتبقي</button>
                <button type="button" onClick={() => setPayAmount(payTarget.overdueAmount)}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">قيمة المتأخرات</button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات</label>
              <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="اختياري"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none" />
            </div>

            <p className="text-xs text-gray-500">
              المتبقي بعد التحصيل:{' '}
              <strong className="text-gray-800">
                {formatCurrency(Math.max(0, payTarget.remaining - (payAmount || 0)), settings?.currency)}
              </strong>
            </p>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={handleCollect} disabled={saving}
              className="flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-60"
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
              {saving ? 'جاري الحفظ...' : 'تأكيد التحصيل'}
            </button>
            <button onClick={() => setPayTarget(null)}
              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200">
              إلغاء
            </button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
