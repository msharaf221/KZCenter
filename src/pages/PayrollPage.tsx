import dayjs from 'dayjs';
import { Banknote, ChevronLeft, ChevronRight, Eye, GraduationCap, Info, Percent, Printer, RefreshCw, Search, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import PayrollDetailsDialog from '../components/PayrollDetailsDialog';
import PayrollPaymentDialog from '../components/PayrollPaymentDialog';
import TeacherPayDialog from '../components/TeacherPayDialog';
import { StatCard } from '../components/ui/Card';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { Expense, PayrollRecord, Teacher } from '../domain/models';
import { calcTeacherPayroll } from '../domain/payroll/calculate';
import { isPayrollPeriod, PAY_MODEL_LABEL, validateTeacherPaySettings } from '../domain/payroll/settings';
import type { PayrollContext, TeacherPayrollCalc } from '../domain/payroll/types';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { printTable } from '../lib/printing';
import { formatCurrency } from '../lib/utils';
import { loadPayrollPage } from '../services/queries/payroll';

interface PayrollRow {
  teacher?: Teacher;
  record?: PayrollRecord;
  value: TeacherPayrollCalc | PayrollRecord;
}

const STATUS = {
  draft: { label: 'مسودة', className: 'bg-gray-100 text-gray-600' },
  pending: { label: 'لم يُصرف', className: 'bg-amber-50 text-amber-700' },
  partial: { label: 'صرف جزئي', className: 'bg-blue-50 text-blue-700' },
  paid: { label: 'مكتمل', className: 'bg-emerald-50 text-emerald-700' },
};

function remainingOf(row: PayrollRow): number {
  return Math.max(0, Math.round((row.value.net - (row.record?.paidAmount || 0)) * 100) / 100);
}

export default function PayrollPage() {
  const { settings } = useApp();
  const { can } = useAuth();
  const canView = can('payroll', 'view');
  const [params, setParams] = useSearchParams();
  const teacherFilter = params.get('teacher') || '';
  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayrollRecord | null>(null);

  const query = useCallback(() => loadPayrollPage(period), [period]);
  const { data: { context, records, expenses }, loading, error: loadError, reload } = useAsyncResource<{
    context: PayrollContext | null;
    records: PayrollRecord[];
    expenses: Expense[];
  }>(query, { context: null, records: [], expenses: [] }, { enabled: canView });
  const error = loadError?.message || '';
  const load = useCallback(async () => { await reload(); }, [reload]);

  const rows = useMemo<PayrollRow[]>(() => {
    if (!context) return [];
    const byTeacher = new Map(records.filter(r => r.period === period).map(r => [r.teacherId, r]));
    const result: PayrollRow[] = context.teachers.filter(t => !t.deleted).map(teacher => {
      const record = byTeacher.get(teacher.id);
      byTeacher.delete(teacher.id);
      return { teacher, record, value: record || calcTeacherPayroll(teacher, period, context) };
    });
    // حذف المدرس لاحقاً لا يخفي كشفاً معتمداً أو مستحقات لم تُصرف بعد.
    for (const record of byTeacher.values()) result.push({ record, value: record });
    return result.sort((a, b) => a.value.teacherName.localeCompare(b.value.teacherName, 'ar'));
  }, [context, records, period]);

  const filtered = rows.filter(row => {
    const status = row.record?.status || 'draft';
    return (!teacherFilter || row.value.teacherId === teacherFilter)
      && (!search.trim() || row.value.teacherName.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar')))
      && (!statusFilter || status === statusFilter);
  });
  const totals = filtered.reduce((sum, row) => ({
    net: sum.net + row.value.net,
    paid: sum.paid + (row.record?.paidAmount || 0),
    remaining: sum.remaining + remainingOf(row),
    approved: sum.approved + (row.record ? 1 : 0),
  }), { net: 0, paid: 0, remaining: 0, approved: 0 });
  const money = (value: number) => formatCurrency(Math.round(value * 100) / 100, settings?.currency);
  const selected = rows.find(row => row.value.teacherId === detailsId);

  function changePeriod(next: string) {
    if (!isPayrollPeriod(next)) return;
    setDetailsId(null);
    setPaying(null);
    setPeriod(next);
  }

  function printSummary() {
    if (!can('payroll', 'export')) return;
    printTable({
      title: 'مرتبات المدرسين', subtitle: period, settings,
      rows: filtered.map(row => ({
        teacher: row.value.teacherName, model: PAY_MODEL_LABEL[row.value.model], basis: row.value.baseLabel,
        gross: row.value.gross, deductions: row.value.deductions, advances: row.value.advances,
        net: row.value.net, paid: row.record?.paidAmount || 0, remaining: remainingOf(row),
        status: STATUS[row.record?.status || 'draft'].label,
      })),
      columns: [
        { key: 'teacher', label: 'المدرس' }, { key: 'model', label: 'طريقة الحساب' }, { key: 'basis', label: 'الأساس' },
        { key: 'gross', label: 'المستحق', format: 'currency' }, { key: 'deductions', label: 'خصومات', format: 'currency' },
        { key: 'advances', label: 'سلف', format: 'currency' }, { key: 'net', label: 'الصافي', format: 'currency' },
        { key: 'paid', label: 'المصروف', format: 'currency' }, { key: 'remaining', label: 'المتبقي', format: 'currency' }, { key: 'status', label: 'الحالة' },
      ],
      totals: [{ label: 'الصافي', value: money(totals.net) }, { label: 'المصروف', value: money(totals.paid) }, { label: 'المتبقي', value: money(totals.remaining) }],
      footer: 'الإجماليات تخص النتائج المعروضة وتشمل المسودات غير المعتمدة. نسبة الاشتراك تحسب من قيمة القسط كاملة بغض النظر عن السداد.',
    });
  }

  if (!canView) return <Layout title="مرتبات المدرسين"><p className="text-gray-500">ليس لديك صلاحية عرض المرتبات.</p></Layout>;

  return (
    <Layout title="مرتبات المدرسين">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">مستحقات شهر {dayjs(`${period}-01`).format('MMMM YYYY')}</h2>
            <p className="text-sm text-gray-500 mt-1">نسبة مستقلة لكل مدرس، وحساب تلقائي مع تفصيل نصيبه من كل طالب.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-600 disabled:opacity-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> تحديث الحسابات
            </button>
            {can('payroll', 'export') && <button onClick={printSummary} disabled={loading || !!error || filtered.length === 0}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2.5 text-sm text-white disabled:opacity-50"><Printer size={16} /> طباعة المرتبات</button>}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-indigo-900">
          <Info size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm leading-6">
            <p className="font-bold">النسبة من الاشتراك الكامل، وليس من المبلغ المدفوع</p>
            <p className="text-xs">من إعدادات كل مدرس اختر «نسبة من اشتراك الطالب». مثال: اشتراك 200 ونسبة 60% = 120 للمدرس، حتى لو الطالب لم يدفع. الإعدادات القديمة لا تتغير تلقائياً.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="payroll-period" className="block text-xs font-semibold text-gray-500 mb-1.5">شهر المرتبات</label>
            <div className="flex items-center gap-1">
              <button aria-label="الشهر السابق" onClick={() => changePeriod(dayjs(`${period}-01`).subtract(1, 'month').format('YYYY-MM'))} className="p-2 text-gray-500 rounded-lg hover:bg-gray-100"><ChevronRight size={18} /></button>
              <input id="payroll-period" type="month" value={period} onChange={e => changePeriod(e.target.value)} className="w-40 rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              <button aria-label="الشهر التالي" onClick={() => changePeriod(dayjs(`${period}-01`).add(1, 'month').format('YYYY-MM'))} className="p-2 text-gray-500 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
            </div>
          </div>
          <div className="flex-1 min-w-44">
            <label htmlFor="payroll-search" className="block text-xs font-semibold text-gray-500 mb-1.5">البحث عن مدرس</label>
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="payroll-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث باسم المدرس..."
                className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label htmlFor="payroll-teacher" className="block text-xs font-semibold text-gray-500 mb-1.5">المدرس</label>
            <select id="payroll-teacher" value={teacherFilter} onChange={e => setParams(e.target.value ? { teacher: e.target.value } : {})} className="max-w-52 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
              <option value="">كل المدرسين</option>
              {rows.map(row => <option key={row.value.teacherId} value={row.value.teacherId}>{row.value.teacherName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="payroll-status" className="block text-xs font-semibold text-gray-500 mb-1.5">حالة الكشف</label>
            <select id="payroll-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
              <option value="">كل الحالات</option>
              {Object.entries(STATUS).map(([key, status]) => <option key={key} value={key}>{status.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? <div role="status" className="py-16 text-center text-gray-500"><RefreshCw className="mx-auto mb-3 animate-spin text-indigo-500" /> جاري حساب مستحقات المدرسين...</div> : error ? (
          <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-700">{error}<button onClick={() => void load()} className="mr-3 underline">إعادة المحاولة</button></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard title="صافي مستحقات الشهر" value={money(totals.net)} color="#6366f1" icon={<Wallet size={22} />} subtitle="لنتائج البحث، شامل المسودات" />
              <StatCard title="المصروف للمدرسين" value={money(totals.paid)} color="#10b981" icon={<Banknote size={22} />} subtitle="دفعات نقدية مسجلة" />
              <StatCard title="المتبقي للمدرسين" value={money(totals.remaining)} color="#f59e0b" icon={<Wallet size={22} />} subtitle="بعد الخصومات والسلف والصرف" />
              <StatCard title="المدرسون" value={filtered.length} color="#8b5cf6" icon={<GraduationCap size={22} />} subtitle={`${totals.approved} كشف معتمد · ${filtered.length - totals.approved} مسودة`} />
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-wrap justify-between gap-2 items-center">
                <h3 className="font-bold text-gray-900">كشف مرتبات المدرسين</h3>
                <Link to="/teachers" className="text-xs font-semibold text-indigo-600 hover:underline">إدارة المدرسين</Link>
              </div>
              {filtered.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <GraduationCap size={44} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-semibold">{rows.length === 0 ? 'لا يوجد مدرسون لحساب المرتبات' : 'لا توجد نتائج مطابقة'}</p>
                  <p className="mt-2 text-sm">{rows.length === 0 ? 'أضف المدرسين واربطهم بمجموعاتهم، ثم حدد نسبة كل مدرس.' : 'جرّب تغيير الشهر أو إزالة فلاتر البحث.'}</p>
                  {rows.length === 0 && can('teachers', 'create') ? <Link to="/teachers" className="inline-block mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white">إضافة مدرس</Link> : rows.length > 0 && <button className="mt-4 text-sm text-indigo-600 underline" onClick={() => { setSearch(''); setStatusFilter(''); setParams({}); }}>إزالة الفلاتر</button>}
                </div>
              ) : (
                <div>
                  <p className="px-4 pt-3 text-xs text-gray-400 lg:hidden">اسحب الجدول أفقيًا لعرض باقي الأرقام والإجراءات.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                        <th className="px-4 py-3">المدرس وطريقة الحساب</th><th className="px-4 py-3">أساس الحساب</th><th className="px-4 py-3">صافي المستحق</th>
                        <th className="px-4 py-3">تم صرفه</th><th className="px-4 py-3">المتبقي</th><th className="px-4 py-3">الحالة</th><th className="px-4 py-3">إجراءات</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">{filtered.map(row => {
                        const { value, record, teacher } = row;
                        const status = STATUS[record?.status || 'draft'];
                        const students = new Set((value.lines || []).flatMap(l => (l.students || []).map(s => s.studentId))).size;
                        const needsSetup = !record && teacher && validateTeacherPaySettings(teacher);
                        return <tr key={value.teacherId} className="hover:bg-gray-50/70">
                          <td className="px-4 py-4 min-w-48"><p className="font-bold text-gray-900">{value.teacherName}</p><p className="mt-1 text-xs text-gray-500">{needsSetup ? 'حدد نسبة المدرس من الإعدادات' : PAY_MODEL_LABEL[value.model]}{!needsSetup && value.rate !== undefined && (value.model === 'subscription_percentage' || value.model === 'percentage') ? ` · ${value.rate}%` : ''}</p></td>
                          <td className="px-4 py-4 text-xs text-gray-500 min-w-40">{value.model === 'subscription_percentage' ? <><p className="text-gray-800 font-semibold">{money(value.base)}</p><p className="mt-1">{students} طالب · {(value.lines || []).length} مجموعة</p></> : value.baseLabel}</td>
                          <td className="px-4 py-4 font-bold text-indigo-700 whitespace-nowrap">{money(value.net)}</td>
                          <td className="px-4 py-4 text-emerald-700 whitespace-nowrap">{money(record?.paidAmount || 0)}</td>
                          <td className="px-4 py-4 font-bold text-gray-900 whitespace-nowrap">{money(remainingOf(row))}</td>
                          <td className="px-4 py-4"><span className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap font-semibold ${status.className}`}>{status.label}</span></td>
                          <td className="px-4 py-4"><div className="flex items-center gap-1">
                            <button onClick={() => setDetailsId(value.teacherId)} aria-label={`تفاصيل مستحقات ${value.teacherName}`} title="تفاصيل الكشف" className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50"><Eye size={18} /></button>
                            {teacher && can('payroll', 'edit') && <button onClick={() => setEditing(teacher)} aria-label={`إعدادات مستحقات ${value.teacherName}`} title="تحديد نسبة المدرس" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"><Percent size={18} /></button>}
                            {record && remainingOf(row) > 0 && can('payroll', 'money') && <button onClick={() => setPaying(record)} aria-label={`صرف مستحقات ${value.teacherName}`} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><Banknote size={16} /> صرف</button>}
                          </div></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs leading-6 text-gray-400">المسودات تتحدث من الاشتراكات المسجلة عند فتح الصفحة أو تحديث الحسابات. الكشوف المعتمدة ثابتة، والصرف يُسجّل مرة واحدة تلقائياً في المصروفات.</p>
          </>
        )}
      </div>

      {editing && <TeacherPayDialog key={editing.id} teacher={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {selected && context && <PayrollDetailsDialog key={`${selected.value.teacherId}:${period}`} teacher={selected.teacher} record={selected.record}
        period={period} context={context} expenses={expenses} onClose={() => setDetailsId(null)} onSaved={load}
        onPay={record => { setDetailsId(null); setPaying(record); }} />}
      {paying && <PayrollPaymentDialog key={paying.id} record={paying} onClose={() => setPaying(null)} onSaved={load} />}
    </Layout>
  );
}
