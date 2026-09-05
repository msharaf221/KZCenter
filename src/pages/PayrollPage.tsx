/**
 * رواتب ومستحقات المدرسين
 *
 * بتحل أكبر فجوة مالية كانت في النظام: الراتب كان رقم ثابت في بطاقة المدرس
 * والمصروفات فيها فئة «رواتب» بتتدخل يدوياً — مفيش حساب فعلي ولا شفافية.
 *
 * دلوقتي:
 *  - حساب شهري لكل مدرس حسب طريقة الحساب (راتب ثابت / بالحصة / نسبة من المحصّل / لكل مجموعة)
 *  - خصم السلف والخصومات
 *  - تفصيل لكل مجموعة (المدرس يشوف حسابه على إيه بالظبط)
 *  - صرف (كلي/جزئي) بيسجّل سند صرف في المصروفات تلقائياً
 */
import { useState, useEffect, useCallback } from 'react';
import { Calculator, Printer, Wallet, Plus, ChevronDown, ChevronUp, Banknote, Minus } from 'lucide-react';
import Layout from '../components/layout/Layout';
import { StatCard } from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import {
  calcPayrollForPeriod, getPayrollForPeriod, savePayrollRecord, payPayroll,
  addTeacherAdvance, getTeacherAdvances, PAY_MODEL_LABEL, TeacherPayrollCalc,
} from '../lib/payroll';
import { dbGetAll, dbPut } from '../lib/db';
import type { PayrollRecord, Teacher, TeacherAdvance, TeacherPayModel } from '../lib/db';
import { formatCurrency, dayjs } from '../lib/utils';
import { printTable } from '../lib/printing';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notifications';
import { addAuditEntry } from '../lib/security';
import { can } from '../lib/permissions';

const MODEL_OPTIONS: TeacherPayModel[] = ['fixed', 'per_session', 'percentage', 'per_group'];

function rateUnit(model: TeacherPayModel, currency?: string): string {
  switch (model) {
    case 'per_session': return `${currency || 'ج'}/حصة`;
    case 'percentage': return '% من المحصّل';
    case 'per_group': return `${currency || 'ج'}/مجموعة`;
    default: return `${currency || 'ج'}/شهر`;
  }
}

export default function PayrollPage() {
  const { settings } = useApp();
  const { user } = useAuth();
  const currency = settings?.currency;

  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const [calcs, setCalcs] = useState<TeacherPayrollCalc[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [showPay, setShowPay] = useState<PayrollRecord | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [showAdvance, setShowAdvance] = useState<Teacher | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceReason, setAdvanceReason] = useState('');
  const [advances, setAdvances] = useState<TeacherAdvance[]>([]);
  const [showSettingsFor, setShowSettingsFor] = useState<Teacher | null>(null);
  const [payForm, setPayForm] = useState<{ model: TeacherPayModel; rate: number; salary: number }>({
    model: 'fixed', rate: 0, salary: 0,
  });

  const canEdit = can(user?.role, 'payroll', 'edit') || can(user?.role, 'payroll', 'money');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, t] = await Promise.all([
        calcPayrollForPeriod(period),
        getPayrollForPeriod(period),
        dbGetAll<Teacher>('teachers'),
      ]);
      setCalcs(c);
      setRecords(r);
      setTeachers(t);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const recordFor = (teacherId: string) => records.find(r => r.teacherId === teacherId) || null;

  interface PayrollTotals { gross: number; advances: number; net: number; paid: number; remaining: number }

  const totals: PayrollTotals = calcs.reduce<PayrollTotals>(
    (acc, c) => ({
      gross: acc.gross + c.gross,
      advances: acc.advances + c.advances,
      net: acc.net + c.net,
      paid: acc.paid + (recordFor(c.teacherId)?.paidAmount || 0),
      remaining: 0,
    }),
    { gross: 0, advances: 0, net: 0, paid: 0, remaining: 0 },
  );
  totals.remaining = Math.max(0, totals.net - totals.paid);

  async function handleSaveCalc(teacherId: string) {
    const calc = calcs.find(c => c.teacherId === teacherId);
    if (!calc) return;
    await savePayrollRecord({ teacherId, period, calc });
    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'payroll', entity: 'payroll', entityId: teacherId,
      details: `حفظ مستحقات ${calc.teacherName} عن ${period}: صافي ${calc.net}`,
    });
    notify.success(`تم حفظ مستحقات ${calc.teacherName}`);
    await load();
  }

  async function handlePay() {
    if (!showPay) return;
    const r = await payPayroll({
      payrollId: showPay.id,
      amount: payAmount > 0 ? payAmount : undefined,
      userId: user?.id,
      username: user?.username,
    });
    if (!r.success) { notify.error(r.error || 'تعذّر الصرف'); return; }

    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'payroll', entity: 'payroll', entityId: showPay.id,
      details: `صرف ${payAmount > 0 ? payAmount : 'كامل المستحق'} لـ ${showPay.teacherName} عن ${period}`,
    });
    notify.success('تم الصرف وتسجيل سند في المصروفات');
    setShowPay(null); setPayAmount(0);
    await load();
  }

  async function handleAdvance() {
    if (!showAdvance) return;
    const r = await addTeacherAdvance({
      teacherId: showAdvance.id,
      amount: advanceAmount,
      reason: advanceReason,
    });
    if (!r.success) { notify.error(r.error || 'تعذّر تسجيل السلفة'); return; }

    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'create', entity: 'teacher_advance', entityId: showAdvance.id,
      details: `سلفة ${advanceAmount} للمدرس ${showAdvance.name}`,
    });
    notify.success('تم تسجيل السلفة — هتتخصم من أقرب شهر');
    setShowAdvance(null); setAdvanceAmount(0); setAdvanceReason('');
    await load();
  }

  function openPaySettings(t: Teacher) {
    setShowSettingsFor(t);
    setPayForm({
      model: t.payModel || 'fixed',
      rate: t.payRate || 0,
      salary: t.salary || 0,
    });
  }

  async function handleSavePaySettings() {
    if (!showSettingsFor) return;
    await dbPut('teachers', {
      ...showSettingsFor,
      payModel: payForm.model,
      payRate: payForm.rate,
      salary: payForm.model === 'fixed' ? payForm.salary : showSettingsFor.salary,
      updatedAt: new Date().toISOString(),
    });
    addAuditEntry({
      userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
      action: 'update', entity: 'teacher', entityId: showSettingsFor.id,
      details: `طريقة حساب مستحقات ${showSettingsFor.name}: ${PAY_MODEL_LABEL[payForm.model]}`,
    });
    notify.success('تم حفظ طريقة الحساب');
    setShowSettingsFor(null);
    await load();
  }

  async function showAdvances(t: Teacher) {
    setAdvances(await getTeacherAdvances(t.id));
    setShowAdvance(t);
  }

  function handlePrint() {
    const rows = calcs.map(c => {
      const rec = recordFor(c.teacherId);
      return {
        teacher: c.teacherName,
        model: PAY_MODEL_LABEL[c.model],
        base: c.baseLabel,
        gross: c.gross,
        advances: c.advances,
        net: c.net,
        paid: rec?.paidAmount || 0,
        remaining: Math.max(0, c.net - (rec?.paidAmount || 0)),
        status: !rec ? 'لم يُحفظ' : rec.status === 'paid' ? 'مدفوع' : rec.status === 'partial' ? 'مدفوع جزئياً' : 'لم يُصرف',
      };
    });

    printTable({
      title: `مستحقات المدرسين — ${period}`,
      settings,
      rows,
      columns: [
        { key: 'teacher', label: 'المدرس' },
        { key: 'model', label: 'طريقة الحساب' },
        { key: 'base', label: 'الأساس' },
        { key: 'gross', label: 'الإجمالي', format: 'currency' },
        { key: 'advances', label: 'سلف', format: 'currency' },
        { key: 'net', label: 'الصافي', format: 'currency' },
        { key: 'paid', label: 'المدفوع', format: 'currency' },
        { key: 'remaining', label: 'الباقي', format: 'currency' },
        { key: 'status', label: 'الحالة', align: 'center' },
      ],
      totals: [
        { label: 'إجمالي المستحقات', value: formatCurrency(totals.net, currency) },
        { label: 'المدفوع', value: formatCurrency(totals.paid, currency) },
        { label: 'الباقي', value: formatCurrency(totals.remaining, currency) },
      ],
      footer: 'الحساب اتعمل آلياً من الحصص المسلَّمة والمحصّل الفعلي والسلف المسجلة',
    });
  }

  return (
    <Layout title="رواتب ومستحقات المدرسين">
      <div className="space-y-5">
        {/* شريط الشهر */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setPeriod(dayjs(period).subtract(1, 'month').format('YYYY-MM'))}
              className="p-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">→</button>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => setPeriod(dayjs(period).add(1, 'month').format('YYYY-MM'))}
              className="p-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">←</button>
          </div>
          <button onClick={() => setPeriod(dayjs().format('YYYY-MM'))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">الشهر الحالي</button>

          <div className="mr-auto flex gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
              <Printer size={16} /> طباعة / PDF
            </button>
          </div>
        </div>

        {/* الكروت */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="إجمالي المستحقات" value={formatCurrency(totals.gross, currency)}
            icon={<Calculator size={22} />} color="#6366f1"
            subtitle={`${calcs.length} مدرس`} />
          <StatCard title="سلف مخصومة" value={formatCurrency(totals.advances, currency)}
            icon={<Minus size={22} />} color="#f59e0b" subtitle="اتسجلت على المدرسين" />
          <StatCard title="الصافي المستحق" value={formatCurrency(totals.net, currency)}
            icon={<Banknote size={22} />} color="#8b5cf6" subtitle="بعد الخصومات" />
          <StatCard title="الباقي لم يُصرف" value={formatCurrency(totals.remaining, currency)}
            icon={<Wallet size={22} />} color={totals.remaining > 0 ? '#ef4444' : '#22c55e'}
            subtitle={`مدفوع: ${formatCurrency(totals.paid, currency)}`} />
        </div>

        {/* الجدول */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">حساب المستحقات</h3>
            <p className="text-xs text-gray-400">الحساب آلي من الحضور المسجّل والمحصّل الفعلي</p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400">جاري الحساب...</div>
          ) : calcs.length === 0 ? (
            <div className="p-12 text-center text-gray-400">مفيش مدرسين — أضف مدرسين الأول من صفحة المدرسين</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-right text-xs text-gray-500">
                    <th className="px-4 py-3 font-medium">المدرس</th>
                    <th className="px-4 py-3 font-medium">طريقة الحساب</th>
                    <th className="px-4 py-3 font-medium">الأساس</th>
                    <th className="px-4 py-3 font-medium">الإجمالي</th>
                    <th className="px-4 py-3 font-medium">سلف</th>
                    <th className="px-4 py-3 font-medium">الصافي</th>
                    <th className="px-4 py-3 font-medium">المدفوع</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {calcs.map(c => {
                    const rec = recordFor(c.teacherId);
                    const teacher = teachers.find(t => t.id === c.teacherId);
                    const isOpen = expanded === c.teacherId;
                    const remaining = Math.max(0, c.net - (rec?.paidAmount || 0));

                    return (
                      <>
                        <tr key={c.teacherId} className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{c.teacherName}</span>
                              {canEdit && (
                                <button onClick={() => openPaySettings(teacher!)}
                                  className="text-[10px] text-indigo-600 hover:underline"
                                  title="تعديل طريقة الحساب">تعديل</button>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400">{teacher?.specialization || '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {PAY_MODEL_LABEL[c.model]}
                            <span className="block text-gray-400">{c.rate ? `${c.rate} ${rateUnit(c.model, currency)}` : ''}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{c.baseLabel}</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{formatCurrency(c.gross, currency)}</td>
                          <td className="px-4 py-3 text-orange-600">{c.advances > 0 ? `-${formatCurrency(c.advances, currency)}` : '—'}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(c.net, currency)}</td>
                          <td className="px-4 py-3 text-green-700">
                            {rec ? formatCurrency(rec.paidAmount, currency) : '—'}
                            {remaining > 0 && rec && (
                              <span className="block text-[10px] text-red-600">باقي {formatCurrency(remaining, currency)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {!rec ? <Badge status="pending" label="لم يُحفظ" />
                              : rec.status === 'paid' ? <Badge status="paid" label="مدفوع" />
                              : rec.status === 'partial' ? <Badge status="late" label="جزئي" />
                              : <Badge status="pending" label="لم يُصرف" />}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setExpanded(isOpen ? null : c.teacherId)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="تفصيل المجموعات">
                                {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </button>
                              {canEdit && (
                                <>
                                  <button onClick={() => handleSaveCalc(c.teacherId)}
                                    className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600" title="حساب وحفظ">
                                    <Calculator size={15} />
                                  </button>
                                  <button onClick={() => showAdvances(teacher!)}
                                    className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600" title="سلف">
                                    <Minus size={15} />
                                  </button>
                                  {rec && remaining > 0 && (
                                    <button onClick={() => { setShowPay(rec); setPayAmount(remaining); }}
                                      className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="صرف">
                                      <Wallet size={15} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${c.teacherId}-detail`}>
                            <td colSpan={9} className="px-4 py-3 bg-gray-50/70">
                              <p className="text-xs font-bold text-gray-600 mb-2">تفصيل المجموعات — {period}</p>
                              {c.lines.length === 0 ? (
                                <p className="text-xs text-gray-400">مفيش مجموعات نشطة للمدرس في الشهر ده</p>
                              ) : (
                                <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
                                  <thead className="bg-gray-100 text-gray-500">
                                    <tr>
                                      <th className="px-3 py-2 text-right font-medium">المجموعة</th>
                                      <th className="px-3 py-2 text-right font-medium">حصص مسلَّمة</th>
                                      <th className="px-3 py-2 text-right font-medium">المحصّل</th>
                                      <th className="px-3 py-2 text-right font-medium">مستحق المدرس</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.lines.map(l => (
                                      <tr key={l.groupId} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-800">{l.groupName}</td>
                                        <td className="px-3 py-2 text-gray-600">{l.sessions}</td>
                                        <td className="px-3 py-2 text-gray-600">{formatCurrency(l.collected, currency)}</td>
                                        <td className="px-3 py-2 font-bold text-gray-900">{formatCurrency(l.amount, currency)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* صرف */}
      <Modal isOpen={!!showPay} onClose={() => setShowPay(null)} title={`صرف مستحقات — ${showPay?.teacherName}`}>
        {showPay && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-gray-500">الشهر</span><b>{showPay.period}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">الإجمالي</span><b>{formatCurrency(showPay.gross, currency)}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">خصومات</span><b className="text-red-600">-{formatCurrency(showPay.deductions, currency)}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">سلف</span><b className="text-orange-600">-{formatCurrency(showPay.advances, currency)}</b></div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5"><span className="text-gray-700 font-bold">الصافي</span><b className="text-indigo-700">{formatCurrency(showPay.net, currency)}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">مدفوع قبل كده</span><b>{formatCurrency(showPay.paidAmount, currency)}</b></div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المصروف دلوقتي</label>
              <input type="number" min={0} value={payAmount} onChange={e => setPayAmount(+e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => setPayAmount(Math.max(0, showPay.net - showPay.paidAmount))}
                  className="text-xs px-2.5 py-1.5 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200">كامل الباقي</button>
                <button onClick={() => setPayAmount(Math.max(0, Math.round((showPay.net - showPay.paidAmount) / 2)))}
                  className="text-xs px-2.5 py-1.5 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200">نص الباقي</button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                الصرف بيسجّل سند في المصروفات (فئة رواتب) تلقائياً عشان الأرباح والخسائر تبقى صحيحة.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handlePay}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">تأكيد الصرف</button>
              <button onClick={() => setShowPay(null)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
            </div>
          </div>
        )}
      </Modal>

      {/* سلف */}
      <Modal isOpen={!!showAdvance} onClose={() => setShowAdvance(null)}
        title={`سلف وعهد — ${showAdvance?.name || ''}`} size="lg">
        <div className="space-y-4">
          {canEdit && (
            <div className="p-4 border border-gray-100 rounded-xl">
              <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Plus size={15} /> تسجيل سلفة جديدة</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="number" min={0} placeholder="المبلغ" value={advanceAmount || ''}
                  onChange={e => setAdvanceAmount(+e.target.value)}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input type="text" placeholder="السبب (اختياري)" value={advanceReason}
                  onChange={e => setAdvanceReason(e.target.value)}
                  className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <button onClick={handleAdvance}
                className="mt-3 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium hover:bg-orange-700">تسجيل السلفة</button>
            </div>
          )}

          <div>
            <p className="text-sm font-bold text-gray-800 mb-2">السجل</p>
            {advances.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">مفيش سلف مسجلة</p>
            ) : (
              <div className="space-y-2">
                {advances.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                    <div>
                      <p className="font-bold text-gray-900">{formatCurrency(a.amount, currency)}</p>
                      <p className="text-xs text-gray-500">{a.date} {a.reason ? `· ${a.reason}` : ''}</p>
                    </div>
                    <Badge status={a.settledInPeriod ? 'paid' : 'pending'}
                      label={a.settledInPeriod ? `اتخصمت في ${a.settledInPeriod}` : 'لسه ما اتخصمتش'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* طريقة الحساب */}
      <Modal isOpen={!!showSettingsFor} onClose={() => setShowSettingsFor(null)}
        title={`طريقة حساب المستحقات — ${showSettingsFor?.name || ''}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الطريقة</label>
            <select value={payForm.model}
              onChange={e => setPayForm({ ...payForm, model: e.target.value as TeacherPayModel })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {MODEL_OPTIONS.map(m => <option key={m} value={m}>{PAY_MODEL_LABEL[m]}</option>)}
            </select>
          </div>

          {payForm.model === 'fixed' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">الراتب الشهري الثابت</label>
              <input type="number" min={0} value={payForm.salary}
                onChange={e => setPayForm({ ...payForm, salary: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">القيمة ({rateUnit(payForm.model, currency)})</label>
              <input type="number" min={0} step={payForm.model === 'percentage' ? 0.5 : 1} value={payForm.rate}
                onChange={e => setPayForm({ ...payForm, rate: +e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-xs text-gray-400 mt-1">
                {payForm.model === 'per_session' && 'الحصص بتتحسب من أيام الحضور المسجلة فعلياً لكل مجموعة في الشهر'}
                {payForm.model === 'percentage' && 'النسبة بتتحسب من المحصّل فعلياً (الدفعات المسددة) لمجموعات المدرس في الشهر'}
                {payForm.model === 'per_group' && 'المبلغ بيتضرب في عدد المجموعات النشطة في الشهر'}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSavePaySettings}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">حفظ</button>
            <button onClick={() => setShowSettingsFor(null)}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">إلغاء</button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
