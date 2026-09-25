import { useId } from 'react';
import type { TeacherPayModel } from '../domain/models';
import { isPercentageModel, PAY_MODEL_LABEL } from '../domain/payroll/settings';
import type { TeacherPaySettings } from '../domain/payroll/types';

interface Props {
  value: TeacherPaySettings;
  onChange: (value: TeacherPaySettings) => void;
  disabled?: boolean;
}

/** نفس إعدادات المستحقات في إضافة المدرس وفي قسم المرتبات (للمحاسب أيضاً). */
export default function TeacherPayFields({ value, onChange, disabled }: Props) {
  const id = useId();
  const model = value.payModel || 'fixed';
  const percentage = isPercentageModel(model);
  const amount = model === 'fixed' ? value.salary : value.payRate;
  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60';

  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
      <legend className="px-2 text-sm font-bold text-indigo-900">إعدادات مستحقات المدرس</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${id}-model`} className="block text-sm font-semibold text-gray-700 mb-1">طريقة حساب المستحقات</label>
          <select id={`${id}-model`} value={model} onChange={e => onChange({ ...value, payModel: e.target.value as TeacherPayModel })}
            className={`${inputClass} bg-white`}>
            {Object.entries(PAY_MODEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-rate`} className="block text-sm font-semibold text-gray-700 mb-1">
            {percentage ? 'نسبة المدرس (%)' : model === 'fixed' ? 'الراتب الشهري' : model === 'per_session' ? 'أجر الحصة' : 'أجر المجموعة شهرياً'}
          </label>
          <input id={`${id}-rate`} type="number" min="0" max={percentage ? 100 : undefined} step="0.01" inputMode="decimal"
            value={amount !== undefined && Number.isFinite(amount) ? amount : ''} required
            onChange={e => {
              const parsed = e.target.value === '' ? undefined : Number(e.target.value);
              onChange(model === 'fixed' ? { ...value, salary: parsed ?? NaN } : { ...value, payRate: parsed });
            }}
            placeholder={percentage ? 'مثال: 60' : '0'} aria-describedby={`${id}-help`} className={`${inputClass} bg-white`} />
        </div>
      </div>
      <div id={`${id}-help`} className="text-xs leading-6 text-indigo-900">
        {model === 'subscription_percentage' ? (
          <>
            <p>النسبة من قيمة اشتراك كل طالب كاملة، سواء دفع أو لسه عليه باقي. لكل مدرس نسبته الخاصة.</p>
            <p>الحساب من اشتراكات الشهر المسجلة في الأقساط بعد أي خصم أو تسعير لمنتصف الشهر؛ الأقساط الملغاة والكتب لا تدخل.</p>
            {typeof value.payRate === 'number' && Number.isFinite(value.payRate) && value.payRate >= 0 && value.payRate <= 100 && (
              <p className="font-bold">مثال: اشتراك 200 × {value.payRate}% = {Math.round(200 * value.payRate) / 100} للمدرس، حتى لو الطالب لم يدفع.</p>
            )}
          </>
        ) : model === 'percentage' ? (
          <p>هذا الخيار القديم يعتمد على المبالغ المحصّلة فعلياً فقط. للحساب من الاشتراك كاملاً اختر «نسبة من اشتراك الطالب».</p>
        ) : model === 'per_session' ? (
          <p>عدد الأيام المختلفة التي سُجّل فيها حضور للمجموعة في الشهر × أجر الحصة.</p>
        ) : model === 'per_group' ? (
          <p>عدد المجموعات النشطة للمدرس في الشهر × أجر المجموعة.</p>
        ) : <p>مبلغ ثابت كل شهر، لا يتوقف على تحصيل اشتراكات الطلاب.</p>}
      </div>
      <div>
        <label htmlFor={`${id}-notes`} className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات الاتفاق (اختياري)</label>
        <textarea id={`${id}-notes`} value={value.payNotes || ''} rows={2}
          onChange={e => onChange({ ...value, payNotes: e.target.value })} className={`${inputClass} resize-none bg-white`} />
      </div>
    </fieldset>
  );
}
