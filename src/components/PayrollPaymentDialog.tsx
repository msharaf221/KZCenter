import dayjs from 'dayjs';
import { Banknote } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import type { PayrollRecord } from '../domain/models';
import { addAuditEntry } from '../lib/audit';
import { notify } from '../lib/notifications';
import { formatCurrency } from '../lib/utils';
import { payPayroll } from '../services/payroll/records';
import Modal from './ui/Modal';

interface Props {
  record: PayrollRecord;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function PayrollPaymentDialog({ record, onClose, onSaved }: Props) {
  const { user, can } = useAuth();
  const { settings } = useApp();
  const remaining = Math.max(0, Math.round((record.net - record.paidAmount) * 100) / 100);
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !can('payroll', 'money')) return;
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0 || value > remaining) {
      setError('أدخل مبلغاً أكبر من صفر ولا يتجاوز المتبقي');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await payPayroll({ payrollId: record.id, amount: value, date, userId: user?.id, username: user?.username });
      if (!result.success) { setError(result.error || 'تعذّر صرف الراتب'); return; }
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'payroll', entity: 'payroll', entityId: record.id,
        details: `صرف ${value} للمدرس ${record.teacherName} عن ${record.period} بتاريخ ${date} — سند ${result.expenseId}`,
      });
      notify.success('تم تسجيل الصرف وإضافة سند في المصروفات');
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر صرف الراتب');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={`صرف مستحقات ${record.teacherName}`}>
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
          <p className="text-sm">المتبقي عن شهر <bdi dir="ltr">{record.period}</bdi></p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(remaining, settings?.currency)}</p>
        </div>
        <div>
          <label htmlFor="payroll-payment-amount" className="block mb-1 text-sm font-semibold text-gray-700">مبلغ الصرف</label>
          <input id="payroll-payment-amount" type="number" min="0.01" max={remaining} step="0.01" required inputMode="decimal"
            value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="mt-1 text-xs text-gray-500">يمكن صرف المبلغ بالكامل أو صرف جزء منه.</p>
        </div>
        <div>
          <label htmlFor="payroll-payment-date" className="block mb-1 text-sm font-semibold text-gray-700">تاريخ الصرف</label>
          <input id="payroll-payment-date" type="date" required value={date} onChange={e => setDate(e.target.value)} disabled={busy}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <p className="text-xs leading-6 text-gray-500">هذا صرف نقدي فعلي. سيُضاف تلقائياً للمصروفات تحت «رواتب» بتاريخ الصرف؛ لا تُدخل نفس المصروف مرة ثانية.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy || !can('payroll', 'money')} className="flex-1 flex justify-center items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <Banknote size={18} /> {busy ? 'جاري تسجيل الصرف...' : 'تأكيد الصرف'}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700">إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}
