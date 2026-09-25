import { Loader2, RefreshCw, ShieldCheck, Wand2, Wrench } from 'lucide-react';
import { type SubjectPrices } from '../../lib/subjects';
import { getContrastColor } from '../../lib/utils';
import { useDataMaintenance } from './useDataMaintenance';

export default function DataMaintenanceSection({
  primaryColor,
  subjectPrices,
}: {
  primaryColor: string;
  subjectPrices: SubjectPrices;
}) {
  const { quality, integrityReport, busy, auditing, autoFixing, checking, handleAudit, handleAutoFix, handleIntegrityCheck, dialog } = useDataMaintenance(subjectPrices);

  return (
    <>
      {dialog}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
          <ShieldCheck size={20} /> جودة الداتا والروابط
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          بيتأكد إن كل مجموعة مربوطة بمدرس وكورس ومادة وسعر، وكل طالب مسجّل وعليه أقساط. المشاكل اللي ينفع تتصلح لوحدها
          بتتصلح بضغطة زرار.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAudit}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
          >
            {auditing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {auditing ? 'جاري الفحص…' : 'افحص الداتا'}
          </button>
          {quality && quality.issues.some(i => i.autoFixable) && (
            <button
              onClick={handleAutoFix}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {autoFixing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {autoFixing ? 'جاري الإصلاح…' : 'إصلاح تلقائي'}
            </button>
          )}
        </div>

        {quality && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="text-sm font-semibold text-gray-700">نتيجة الجودة</span>
              <span
                className="text-lg font-bold"
                style={{ color: quality.score >= 90 ? '#059669' : quality.score >= 70 ? '#d97706' : '#dc2626' }}
              >
                {quality.score}/100
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {[
                { label: 'طالب', value: quality.totals.students },
                { label: 'مدرس', value: quality.totals.teachers },
                { label: 'كورس', value: quality.totals.courses },
                { label: 'مجموعة', value: quality.totals.groups },
                { label: 'تسجيل', value: quality.totals.enrollments },
                { label: 'مترابط', value: `${quality.totals.subjectCoverage}%` },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg py-2">
                  <div className="text-sm font-bold text-gray-900">{s.value}</div>
                  <div className="text-[10px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>

            {quality.bySubject.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quality.bySubject.map(s => (
                  <span key={s.id} className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
                    <b>{s.name}</b>: {s.groups} مجموعة · {s.students} طالب · {s.price} شهرياً
                  </span>
                ))}
              </div>
            )}

            {quality.issues.length === 0 ? (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                ✓ كل حاجة مترابطة صح
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {quality.issues.map(issue => (
                  <div
                    key={issue.code}
                    className={`text-xs rounded-lg px-3 py-2 border ${issue.severity === 'error'
                      ? 'bg-red-50 border-red-100 text-red-800'
                      : issue.severity === 'warning'
                        ? 'bg-amber-50 border-amber-100 text-amber-800'
                        : 'bg-gray-50 border-gray-100 text-gray-600'
                      }`}
                  >
                    <div className="font-medium">
                      {issue.message} ({issue.count})
                      {issue.autoFixable && <span className="text-[10px] opacity-70"> — يتصلح تلقائياً</span>}
                    </div>
                    <div className="opacity-75 mt-0.5">
                      {issue.entities.slice(0, 6).join('، ')}
                      {issue.count > 6 ? ' …' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Wrench size={20} /> فحص سلامة البيانات
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          يفحص الروابط بين الطلاب والمجموعات والكورسات والمدرسين، ويصلح أي روابط تالفة (مثل تسجيلات في مجموعات محذوفة)
          ويعيد حساب المستحقات تلقائياً.
        </p>
        <button
          onClick={handleIntegrityCheck}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium ${checking ? 'opacity-60' : ''}`}
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
        >
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          {checking ? 'جاري الفحص والإصلاح...' : 'فحص وإصلاح الآن'}
        </button>

        {integrityReport && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1 text-sm">
            <p className="font-bold text-gray-900 mb-2">نتيجة الفحص:</p>
            <p className="text-gray-600">
              • تسجيلات تالفة تم تنظيفها من ملفات الطلاب: <strong>{integrityReport.staleEnrollments}</strong>
            </p>
            <p className="text-gray-600">
              • طلاب محذوفون تم إزالتهم من المجموعات: <strong>{integrityReport.staleGroupMembers}</strong>
            </p>
            <p className="text-gray-600">
              • طلاب أعيد حساب مستحقاتهم: <strong>{integrityReport.recalculatedStudents}</strong>
            </p>
            {integrityReport.orphanGroupCourses.length > 0 && (
              <p className="text-red-600">
                ⚠️ مجموعات مرتبطة بكورس محذوف (تحتاج تدخل يدوي): {integrityReport.orphanGroupCourses.join('، ')}
              </p>
            )}
            {integrityReport.orphanGroupTeachers.length > 0 && (
              <p className="text-red-600">
                ⚠️ مجموعات مرتبطة بمدرس محذوف (تحتاج تدخل يدوي): {integrityReport.orphanGroupTeachers.join('، ')}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
