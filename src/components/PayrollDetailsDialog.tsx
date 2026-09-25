import { Banknote, LockKeyhole, Printer, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { Expense, PayrollRecord, Teacher } from '../domain/models';
import { calcTeacherPayroll } from '../domain/payroll/calculate';
import { PAY_MODEL_LABEL, validateTeacherPaySettings } from '../domain/payroll/settings';
import type { PayrollContext } from '../domain/payroll/types';
import { addAuditEntry } from '../lib/audit';
import { notify } from '../lib/notifications';
import { printTable } from '../lib/printing';
import { formatCurrency, formatDate } from '../lib/utils';
import { savePayrollRecord } from '../services/payroll/records';
import Modal from './ui/Modal';

interface Props {
  teacher?: Teacher;
  record?: PayrollRecord;
  period: string;
  context: PayrollContext;
  expenses: Expense[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onPay: (record: PayrollRecord) => void;
}

export default function PayrollDetailsDialog({ teacher, record, period, context, expenses, onClose, onSaved, onPay }: Props) {
  const { settings } = useApp();
  const { user, can } = useAuth();
  const [deductions, setDeductions] = useState(String(record?.deductions || 0));
  const [notes, setNotes] = useState(record?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const deductionValue = Number(deductions);
  const calc = !record && teacher ? calcTeacherPayroll(teacher, period, context, {
    deductions: Number.isFinite(deductionValue) ? deductionValue : 0,
  }) : undefined;
  const value = record || calc;
  if (!value) return null;

  const money = (amount: number) => formatCurrency(amount, settings?.currency);
  const lines = value.lines || [];
  const subscriptionModel = value.model === 'subscription_percentage';
  const studentRows = lines.flatMap(line => (line.students || []).map(student => ({ ...student, groupName: line.groupName })));
  const remaining = Math.max(0, Math.round((value.net - (record?.paidAmount || 0)) * 100) / 100);
  const payError = !record && teacher ? validateTeacherPaySettings(teacher) : null;
  const emptySubscriptions = subscriptionModel && lines.length === 0;
  const payouts = expenses.filter(e => !e.deleted && e.payrollId === record?.id).sort((a, b) => a.date.localeCompare(b.date));

  async function approve(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || record || !teacher || !calc || !can('payroll', 'create')) return;
    if (payError) { setError(payError); return; }
    if (!deductions.trim() || !Number.isFinite(deductionValue) || deductionValue < 0 || deductionValue > calc.gross) {
      setError('الخصومات يجب أن تكون بين صفر وإجمالي المستحق');
      return;
    }
    if (emptySubscriptions) { setError('لا توجد اشتراكات مسجلة لهذا المدرس في الشهر المختار'); return; }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await savePayrollRecord({ teacherId: teacher.id, period, calc, notes });
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'payroll', entity: 'payroll', entityId: saved.id,
        details: `اعتماد مستحقات ${saved.teacherName} عن ${period}: ${saved.baseLabel}، صافي ${saved.net}`,
      });
      notify.success('تم اعتماد كشف الشهر وحفظ تفاصيله');
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر اعتماد الكشف');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function print() {
    if (!value || !can('payroll', 'export')) return;
    const common = {
      title: `كشف مستحقات ${value.teacherName}`,
      subtitle: `${period} — ${record ? 'كشف معتمد' : 'مسودة غير معتمدة'}`,
      settings,
      meta: [
        { label: 'طريقة الحساب', value: PAY_MODEL_LABEL[value.model] },
        { label: 'الأساس', value: value.baseLabel },
      ],
      totals: [
        { label: 'المستحق', value: money(value.gross) },
        { label: 'الخصومات', value: money(value.deductions) },
        { label: 'السلف المخصومة', value: money(value.advances) },
        { label: 'الصافي', value: money(value.net) },
        { label: 'المصروف', value: money(record?.paidAmount || 0) },
        { label: 'المتبقي', value: money(remaining) },
      ],
      footer: `${subscriptionModel ? 'النسبة من قيمة اشتراك الشهر المسجل، بغض النظر عن السداد. ' : ''}${notes}`,
    };
    if (subscriptionModel && studentRows.length > 0) {
      printTable({ ...common, rows: studentRows.map(s => ({ ...s, percentage: `${s.rate}%` })), columns: [
        { key: 'studentName', label: 'الطالب' }, { key: 'groupName', label: 'المجموعة' },
        { key: 'subscriptionAmount', label: 'قيمة الاشتراك', format: 'currency' },
        { key: 'percentage', label: 'نسبة المدرس' }, { key: 'amount', label: 'نصيب المدرس', format: 'currency' },
      ] });
    } else {
      printTable({ ...common, rows: lines.map(l => ({ ...l })), columns: [
        { key: 'groupName', label: 'المجموعة' }, { key: 'sessions', label: 'الحصص' },
        { key: 'collected', label: 'المحصّل', format: 'currency' }, { key: 'amount', label: 'نصيب المدرس', format: 'currency' },
      ] });
    }
  }

  return (
    <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={`كشف مستحقات ${value.teacherName} — ${formatDate(`${period}-01`, 'MMMM YYYY')}`} size="xl">
      <form onSubmit={approve} className="space-y-5">
        <div className={`rounded-xl p-3 text-sm leading-6 ${record ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          <p className="flex items-center gap-2 font-semibold">
            {record ? <LockKeyhole size={16} /> : <ShieldCheck size={16} />}
            {record ? `كشف معتمد في ${formatDate(record.createdAt)} — النسبة والتفاصيل محفوظة` : 'مسودة تلقائية — راجع التفاصيل ثم اعتمد كشف الشهر'}
          </p>
          <p className="text-xs mt-1">{value.baseLabel}</p>
          {subscriptionModel && <p className="text-xs">الاشتراكات محسوبة حسب شهر استحقاق القسط، بعد الخصومات وتسعير منتصف الشهر. سداد الطالب أو تأخره لا يغيّر نصيب المدرس. الأقساط الملغاة والمحذوفة والكتب مستبعدة.</p>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['إجمالي المستحق', value.gross], ['خصومات وسلف', value.deductions + value.advances],
            ['صافي المستحق', value.net], ['المتبقي للمدرس', remaining],
          ].map(([label, amount]) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="mt-1 text-base font-bold text-gray-900">{money(Number(amount))}</p>
            </div>
          ))}
        </div>

        {subscriptionModel ? (
          <section>
            <h3 className="font-bold text-gray-900 mb-3">نصيب المدرس من كل طالب ({new Set(studentRows.map(s => s.studentId)).size} طالب)</h3>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm text-right">
                <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                  <th className="p-3">الطالب</th><th className="p-3">المجموعة</th><th className="p-3">قيمة الاشتراك</th><th className="p-3">نسبة المدرس</th><th className="p-3">نصيب المدرس</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {studentRows.map(s => <tr key={`${s.studentId}:${s.installmentIds.join(',')}`}>
                    <td className="p-3 font-medium text-gray-900">{s.studentName}</td><td className="p-3 text-gray-600">{s.groupName}</td>
                    <td className="p-3 whitespace-nowrap">{money(s.subscriptionAmount)}</td><td className="p-3">{s.rate}%</td>
                    <td className="p-3 font-bold text-indigo-700 whitespace-nowrap">{money(s.amount)}</td>
                  </tr>)}
                  {studentRows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">لا توجد اشتراكات مسجلة لهذا الشهر. راجع تسجيل الطلاب وتجديد اشتراكاتهم.</td></tr>}
                </tbody>
                {studentRows.length > 0 && <tfoot className="bg-indigo-50 font-bold"><tr>
                  <td colSpan={2} className="p-3">الإجمالي</td><td className="p-3 whitespace-nowrap">{money(value.base)}</td><td />
                  <td className="p-3 text-indigo-700 whitespace-nowrap">{money(value.gross)}</td>
                </tr></tfoot>}
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">الطالب المشترك في أكثر من مجموعة يظهر بسطر مستقل لكل مجموعة، وتُجمع اشتراكاته داخل نفس المجموعة.</p>
          </section>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3">المجموعة</th><th className="p-3">الحصص</th><th className="p-3">المحصّل</th><th className="p-3">نصيب المدرس</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{lines.map(l => <tr key={l.groupId}>
                <td className="p-3">{l.groupName}</td><td className="p-3">{l.sessions}</td><td className="p-3">{money(l.collected)}</td><td className="p-3 font-bold">{money(l.amount)}</td>
              </tr>)}{lines.length === 0 && <tr><td colSpan={4} className="p-5 text-center text-gray-400">لا توجد تفاصيل مجموعات لهذا الشهر</td></tr>}</tbody>
            </table>
          </div>
        )}

        {!record && can('payroll', 'create') ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="payroll-deductions" className="block text-sm font-semibold text-gray-700 mb-1">خصومات إضافية</label>
              <input id="payroll-deductions" type="number" min="0" max={value.gross} step="0.01" required value={deductions}
                onChange={e => setDeductions(e.target.value)} disabled={busy} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
              <p className="text-xs text-gray-500 mt-2">سلف تُخصم عند الاعتماد: {money(value.advances)}</p>
            </div>
            <div>
              <label htmlFor="payroll-notes" className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات الكشف / سبب الخصم</label>
              <textarea id="payroll-notes" value={notes} onChange={e => setNotes(e.target.value)} disabled={busy} rows={2}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
            </div>
          </div>
        ) : <p className="text-xs text-gray-500 leading-6">الخصومات: {money(value.deductions)} · السلف المخصومة: {money(value.advances)}{notes ? ` · ${notes}` : ''}</p>}

        {record && (
          <section className="rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-2">سجل الصرف — الإجمالي {money(record.paidAmount)}</h3>
            {payouts.length > 0 ? <ul className="divide-y divide-gray-100 text-sm">{payouts.map(p => (
              <li key={p.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span className="text-gray-500">{formatDate(p.date)} · {p.username || 'غير مسجل'}</span><span className="font-bold text-emerald-700">{money(p.amount)}</span>
              </li>
            ))}</ul> : <p className="text-xs text-gray-400">{record.paidAmount > 0 ? 'صرف مسجل في كشف سابق دون سند مرتبط.' : 'لم تُسجّل دفعات نقدية لهذا الكشف.'}</p>}
          </section>
        )}

        {(error || payError) && <p role="alert" className="text-sm text-red-700">{error || payError}</p>}
        {!record && <p className="text-xs leading-6 text-gray-500">اعتمد الكشف بعد اكتمال تسجيل اشتراكات الشهر. الاعتماد يثبت النسبة والتفاصيل ولا يصرف نقدية؛ الصرف خطوة منفصلة، ولن يُعاد حساب الكشف المعتمد عند تغيير النسبة.</p>}
        <div className="flex flex-wrap gap-3">
          {!record && can('payroll', 'create') && <button type="submit" disabled={busy || !!payError || emptySubscriptions}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
            <ShieldCheck size={17} /> {busy ? 'جاري الاعتماد...' : 'اعتماد كشف الشهر'}
          </button>}
          {record && remaining > 0 && can('payroll', 'money') && <button type="button" onClick={() => onPay(record)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold"><Banknote size={17} /> صرف مستحقات</button>}
          {can('payroll', 'export') && <button type="button" onClick={print} className="flex items-center gap-2 rounded-xl px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold"><Printer size={17} /> طباعة الكشف</button>}
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl px-4 py-2.5 text-gray-500 text-sm">إغلاق</button>
        </div>
      </form>
    </Modal>
  );
}
