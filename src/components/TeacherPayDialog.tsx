import { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Teacher } from '../domain/models';
import { describeTeacherPay, validateTeacherPaySettings } from '../domain/payroll/settings';
import type { TeacherPaySettings } from '../domain/payroll/types';
import { addAuditEntry } from '../lib/audit';
import { notify } from '../lib/notifications';
import { updateTeacherPaySettings } from '../services/payroll/settings';
import TeacherPayFields from './TeacherPayFields';
import Modal from './ui/Modal';

interface Props {
  teacher: Teacher;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function TeacherPayDialog({ teacher, onClose, onSaved }: Props) {
  const { user, can } = useAuth();
  const [form, setForm] = useState<TeacherPaySettings>({
    payModel: teacher.payModel || 'fixed', payRate: teacher.payRate,
    salary: teacher.salary || 0, payNotes: teacher.payNotes || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !can('payroll', 'edit')) return;
    const validation = validateTeacherPaySettings(form);
    if (validation) { setError(validation); return; }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await updateTeacherPaySettings(teacher.id, form);
      addAuditEntry({
        userId: user?.id || 'unknown', username: user?.username || 'غير معروف',
        action: 'update', entity: 'teacher', entityId: teacher.id,
        details: `تعديل مستحقات ${teacher.name}: ${describeTeacherPay(teacher)} ← ${describeTeacherPay(form)}`,
      });
      notify.success('تم حفظ إعدادات مستحقات المدرس');
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حفظ إعدادات المستحقات');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal isOpen onClose={() => { if (!busy) onClose(); }} title={`مستحقات ${teacher.name}`} size="lg">
      <form onSubmit={save} className="space-y-4">
        <TeacherPayFields value={form} onChange={setForm} disabled={busy} />
        <p className="text-xs text-gray-500 leading-6">تغيير النسبة يؤثر على الكشوف غير المعتمدة فقط. الكشوف المعتمدة تحتفظ بنسبة المدرس وتفاصيل الطلاب وقت اعتمادها.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy || !can('payroll', 'edit')} className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'جاري الحفظ...' : 'حفظ إعدادات المستحقات'}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700">إلغاء</button>
        </div>
      </form>
    </Modal>
  );
}
