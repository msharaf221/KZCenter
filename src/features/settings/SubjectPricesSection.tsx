import { Loader2, Tag, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { notify } from '../../lib/notifications';
import { DEFAULT_SUBJECT_PRICES, SUBJECTS, subjectPrice, type SubjectId, type SubjectPrices } from '../../lib/subjects';
import { syncSubjects, type SubjectSyncReport } from '../../lib/subjectSync';
import { getContrastColor } from '../../lib/utils';
import type { SettingsSectionProps } from './types';

export default function SubjectPricesSection({ form, setForm, primaryColor }: SettingsSectionProps) {
  const { updateSettings } = useApp();
  const [applyingSubjects, setApplyingSubjects] = useState(false);

  const [subjectReport, setSubjectReport] = useState<SubjectSyncReport | null>(null);

  /**
   * حفظ أسعار المواد + تطبيقها على الكورسات والمجموعات والمدرسين
   * (والأقساط اللي لسه مدفعش فيها حاجة).
   */
  async function handleApplySubjectPrices() {
    setApplyingSubjects(true);
    try {
      await updateSettings({ subjectPrices: form.subjectPrices });
      const report = await syncSubjects({ prices: form.subjectPrices });
      setSubjectReport(report);
      notify.success(
        `تم التطبيق: ${report.coursesCreated} كورس جديد · ${report.coursesLinked} اترابط بمادته · ` +
          `${report.coursesRepriced} سعر اتحدّث · ${report.installmentsUpdated} قسط`,
      );
    } catch {
      notify.error('حصل خطأ أثناء تطبيق أسعار المواد');
    } finally {
      setApplyingSubjects(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Tag size={20} /> المواد وأسعار الشهر
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        السعر ده بيتطبّق على كل كورس مربوط بالمادة، وأي كورس جديد بياخده تلقائياً.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SUBJECTS.map(s => {
          const value = form.subjectPrices?.[s.id];
          return (
            <div key={s.id} className="border border-gray-100 rounded-xl p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <span className="text-xl">{s.icon}</span>
                <span>{s.name}</span>
                <span className="text-[11px] text-gray-400 font-normal">{s.nameEn}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={value ?? ''}
                  placeholder={String(DEFAULT_SUBJECT_PRICES[s.id])}
                  onChange={e => {
                    const raw = e.target.value;
                    setForm(f => {
                      const next: SubjectPrices = { ...f.subjectPrices };
                      if (raw === '') delete next[s.id];
                      else next[s.id] = Math.max(0, Number(raw) || 0);
                      return { ...f, subjectPrices: next };
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none"
                />
                <span className="text-xs text-gray-400 shrink-0">{form.currency}/شهر</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                الافتراضي: {DEFAULT_SUBJECT_PRICES[s.id]} — السعر الحالي:{' '}
                <b>{subjectPrice(s.id as SubjectId, form.subjectPrices)}</b>
              </p>
            </div>
          );
        })}
      </div>

      {subjectReport && (
        <div className="mt-4 text-xs text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 space-y-1">
          <div>
            كورسات: {subjectReport.coursesCreated} جديد · {subjectReport.coursesLinked} اترابط ·{' '}
            {subjectReport.coursesRepriced} سعر اتحدّث — مجموعات: {subjectReport.groupsLinked} · مدرسين:{' '}
            {subjectReport.teachersLinked}
          </div>
          <div>
            أقساط اتحدّثت (غير مدفوعة): {subjectReport.installmentsUpdated} · طلاب أعيد حساب أرصدتهم:{' '}
            {subjectReport.studentsRecalculated}
          </div>
          {subjectReport.coursesUnmatched.length > 0 && (
            <div className="text-amber-800">
              كورسات محتاجة ربط يدوي: {subjectReport.coursesUnmatched.slice(0, 10).join('، ')}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        <button
          onClick={handleApplySubjectPrices}
          disabled={applyingSubjects}
          className="flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
        >
          {applyingSubjects ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {applyingSubjects ? 'جاري التطبيق…' : 'حفظ وتطبيق على الكورسات'}
        </button>
        <button
          onClick={() => setForm(f => ({ ...f, subjectPrices: {} }))}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
        >
          رجّع الأسعار الافتراضية
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        الأقساط المدفوعة (كلياً أو جزئياً) والتسجيلات اللي ليها سعر خاص/خصم مش بتتغير — الجديد بس هو اللي بياخد السعر
        الجديد.
      </p>
    </div>
  );
}
