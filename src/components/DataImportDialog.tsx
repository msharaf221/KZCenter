import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, Users, Layers, GraduationCap,
  BookOpen, ShieldCheck, Wand2, Link2,
} from 'lucide-react';
import Modal from './ui/Modal';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import { getContrastColor } from '../lib/utils';
import {
  parseAnyTable, type TableParseResult, type FieldKey,
} from '../lib/tableImport';
import {
  importTableIntoDb, linkOrphans,
  type TableImportOptions, type TableImportReport,
} from '../lib/tableImportDb';
import { auditData, autoFix, type QualityReport } from '../lib/dataQuality';
import { getSubjectPrices } from '../lib/subjectSync';
import { SUBJECTS, type SubjectId } from '../lib/subjects';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

/** أسماء الحقول للعرض */
const FIELD_LABELS: Record<FieldKey, string> = {
  studentName: 'اسم الطالب',
  studentPhone: 'تليفون الطالب',
  parentPhone: 'تليفون ولي الأمر',
  age: 'السن',
  gender: 'النوع',
  teacherName: 'المدرس',
  teacherPhone: 'تليفون المدرس',
  groupName: 'المجموعة',
  courseName: 'الكورس',
  subject: 'المادة',
  price: 'السعر',
  day: 'اليوم',
  time: 'الميعاد',
  room: 'القاعة',
  maxStudents: 'السعة',
  notes: 'ملاحظات',
};

/**
 * استيراد داتا جدولية (Excel / CSV / JSON) بأي شكل:
 * كل صف = طالب، والأعمدة بتتعرف تلقائياً (مدرس/مجموعة/مادة/سعر…).
 * بعد الاستيراد بيتعمل ربط تلقائي للناقص + فحص جودة شامل.
 */
export default function DataImportDialog({ open, onClose, onDone }: Props) {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<TableParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [report, setReport] = useState<TableImportReport | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [fixing, setFixing] = useState(false);
  const [prices, setPrices] = useState<Record<SubjectId, number> | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [opts, setOpts] = useState<TableImportOptions>({
    useSubjectPrices: true,
    subjectPrices: null,
    fallbackPrice: 0,
    phonePrefix: '0100000',
    maxStudents: 40,
    rowPriceAsOverride: true,
  });

  useEffect(() => {
    if (!open) return;
    getSubjectPrices().then(p => {
      setPrices(p);
      setOpts(o => ({ ...o, subjectPrices: p }));
    });
  }, [open]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setReport(null);
    setQuality(null);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseAnyTable({ name: file.name, buffer });
      if (result.records.length === 0) {
        notify.error('مفيش سجلات في الملف — لازم يكون فيه عمود لاسم الطالب على الأقل');
        setParsed(null);
      } else {
        setParsed(result);
        if (!result.looksLikeTable) {
          notify.error('الملف مش شكله جدول سجلات — جرّب «استيراد شيت إكسيل» لو ده شيت المركز القديم');
        }
      }
    } catch (err) {
      notify.error(`ماقدرتش أقرا الملف: ${(err as Error).message}`);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const runImport = useCallback(async () => {
    if (!parsed) return;
    setBusy(true);
    setReport(null);
    setQuality(null);
    setProgress({ done: 0, total: 1, label: 'جاري التحضير…' });
    try {
      const result = await importTableIntoDb(parsed.records, opts, (done, total, label) => {
        if (done % 20 === 0 || done === total) setProgress({ done, total, label });
      });
      // ربط أي كيانات قديمة فضلت من غير مادة
      await linkOrphans();
      setReport(result);
      setProgress({ done: 1, total: 1, label: 'جاري الفحص…' });
      setQuality(await auditData());
      setProgress({ done: 1, total: 1, label: 'تم' });

      if (result.errors.length > 0) {
        notify.error(`تم الاستيراد مع ${result.errors.length} ملاحظة`);
      } else {
        notify.success(
          `تم: ${result.studentsCreated} طالب · ${result.groupsCreated} مجموعة · ` +
          `${result.enrollmentsCreated} تسجيل`
        );
      }
      onDone();
    } catch (err) {
      notify.error(`حصل خطأ أثناء الاستيراد: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [parsed, opts, onDone]);

  const runAutoFix = useCallback(async () => {
    setFixing(true);
    try {
      const fix = await autoFix(prices || undefined);
      setQuality(await auditData());
      notify.success(
        `تم الإصلاح: ${fix.coursesLinked} كورس اترابط · ${fix.coursesRepriced} سعر · ` +
        `${fix.groupsLinked} مجموعة · ${fix.teachersLinked} مدرس`
      );
      onDone();
    } catch {
      notify.error('حصل خطأ أثناء الإصلاح');
    } finally {
      setFixing(false);
    }
  }, [prices, onDone]);

  const percent = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  /** توزيع السجلات على المواد (معاينة) */
  const subjectRows = useMemo(() => {
    if (!parsed) return [];
    const counts = new Map<SubjectId, number>();
    for (const r of parsed.records) {
      if (!r.subject) continue;
      counts.set(r.subject.id, (counts.get(r.subject.id) || 0) + 1);
    }
    return SUBJECTS.filter(s => counts.has(s.id)).map(s => ({
      ...s,
      rows: counts.get(s.id) || 0,
      price: prices?.[s.id] ?? s.monthlyPrice,
    }));
  }, [parsed, prices]);

  const withoutSubject = parsed?.records.filter(r => !r.subject).length || 0;
  const visibleRows = parsed ? (showAllRows ? parsed.records : parsed.records.slice(0, 10)) : [];

  return (
    <Modal isOpen={open} onClose={busy ? () => {} : onClose} title="استيراد داتا (Excel / CSV / JSON)" size="xl">
      <div className="p-5 space-y-4 overflow-y-auto">
        {/* ---------- الملف ---------- */}
        <label
          className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            parsed ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'
          }`}
        >
          <FileSpreadsheet size={22} className={parsed ? 'text-emerald-600' : 'text-gray-400'} />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">
              {parsing ? 'جاري قراءة الملف…' : fileName || 'اختار ملف (.xlsx / .csv / .json)'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              كل صف = طالب · الأعمدة بتتعرف لوحدها (مدرس · مجموعة · مادة · سعر · ميعاد)
            </div>
          </div>
          {parsed && <CheckCircle2 size={20} className="text-emerald-600" />}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json,.txt"
            disabled={busy}
            onChange={e => handleFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        {/* ---------- الإعدادات ---------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                disabled={busy}
                checked={opts.useSubjectPrices}
                onChange={e => setOpts(o => ({ ...o, useSubjectPrices: e.target.checked }))}
                className="w-4 h-4"
              />
              <span>
                استخدم أسعار المواد المعتمدة
                <span className="text-gray-400 font-normal">
                  {' '}(إنجليزي {prices?.english ?? 250} · ماث {prices?.math ?? 250} ·
                  {' '}حساب {prices?.hesab ?? 200} · عربي {prices?.arabic ?? 200} · قرآن {prices?.quran ?? 200})
                </span>
              </span>
            </label>
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 p-3 bg-gray-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                disabled={busy}
                checked={opts.rowPriceAsOverride}
                onChange={e => setOpts(o => ({ ...o, rowPriceAsOverride: e.target.checked }))}
                className="w-4 h-4"
              />
              <span>
                السعر المكتوب في الصف يتسجّل كسعر خاص للطالب
                <span className="text-gray-400 font-normal"> (بدل ما يغيّر سعر الكورس على الكل)</span>
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">سعر السجلات المجهولة المادة</label>
            <input
              type="number" min={0} step={50} disabled={busy}
              value={opts.fallbackPrice}
              onChange={e => setOpts(o => ({ ...o, fallbackPrice: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">أقصى عدد طلاب في المجموعة</label>
            <input
              type="number" min={1} disabled={busy}
              value={opts.maxStudents}
              onChange={e => setOpts(o => ({ ...o, maxStudents: Math.max(1, Number(e.target.value) || 1) }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* ---------- المعاينة ---------- */}
        {parsed && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Users, label: 'طالب', value: parsed.uniqueStudents, testId: 'stat-students' },
                { icon: GraduationCap, label: 'مدرس', value: parsed.teachers.length, testId: 'stat-teachers' },
                { icon: Layers, label: 'مجموعة', value: parsed.groups.length || '—', testId: 'stat-groups' },
                { icon: BookOpen, label: 'مادة', value: parsed.subjects.length, testId: 'stat-subjects' },
              ].map(({ icon: Icon, label, value, testId }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <Icon size={18} className="mx-auto text-gray-400 mb-1" />
                  <div data-testid={testId} className="text-xl font-bold text-gray-900">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            {/* الأعمدة اللي اتعرفت */}
            <div className="border border-gray-100 rounded-xl p-3">
              <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Link2 size={13} /> الأعمدة اللي اتعرفت
              </div>
              <div className="flex flex-wrap gap-1.5">
                {parsed.detectedFields.map(f => (
                  <span key={f} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-2 py-1">
                    {FIELD_LABELS[f]}
                  </span>
                ))}
                {parsed.unknownHeaders.slice(0, 6).map(h => (
                  <span key={h} className="text-xs bg-gray-50 text-gray-400 border border-gray-100 rounded-lg px-2 py-1">
                    {h} (متجاهَل)
                  </span>
                ))}
              </div>
            </div>

            {/* المواد */}
            {subjectRows.length > 0 && (
              <div className="border border-gray-100 rounded-xl p-3">
                <div className="text-xs font-bold text-gray-700 mb-2">المواد والأسعار اللي هتتطبق</div>
                <div className="flex flex-wrap gap-2">
                  {subjectRows.map(s => (
                    <span key={s.id} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                      {s.icon} <b>{s.name}</b> — {s.rows} صف ·{' '}
                      <span className="text-green-600 font-semibold">{s.price} شهرياً</span>
                    </span>
                  ))}
                  {withoutSubject > 0 && (
                    <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      {withoutSubject} صف مجهول المادة → {opts.fallbackPrice}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* عيّنة الصفوف */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-right text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">الطالب</th>
                      <th className="px-3 py-2 font-medium">المدرس</th>
                      <th className="px-3 py-2 font-medium">المجموعة</th>
                      <th className="px-3 py-2 font-medium">المادة</th>
                      <th className="px-3 py-2 font-medium">السعر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleRows.map((r, i) => (
                      <tr key={`${r.studentName}-${i}`} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-medium text-gray-900">{r.studentName}</td>
                        <td className="px-3 py-2 text-gray-600">{r.teacherName || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{r.groupName || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.subject ? `${r.subject.icon} ${r.subject.name}` : <span className="text-amber-600">؟</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.price ?? (r.subject ? (prices?.[r.subject.id] ?? r.subject.monthlyPrice) : opts.fallbackPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.records.length > 10 && (
                <button
                  onClick={() => setShowAllRows(v => !v)}
                  className="w-full py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                >
                  {showAllRows ? 'إخفاء' : `عرض كل الصفوف (${parsed.records.length})`}
                </button>
              )}
            </div>

            {parsed.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 space-y-1">
                {parsed.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------- التقدم ---------- */}
        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{progress.label}</span>
              <span>{percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150"
                style={{ width: `${percent}%`, backgroundColor: primaryColor }} />
            </div>
          </div>
        )}

        {/* ---------- نتيجة الاستيراد ---------- */}
        {report && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-900 space-y-1">
            <div className="font-bold flex items-center gap-2">
              <CheckCircle2 size={16} /> تم الاستيراد والربط
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <span>مدرسين: {report.teachersCreated} جديد / {report.teachersExisting} موجود</span>
              <span>كورسات: {report.coursesCreated} جديد / {report.coursesExisting} موجود</span>
              <span>مجموعات: {report.groupsCreated} جديد / {report.groupsExisting} موجود</span>
              <span>طلاب: {report.studentsCreated} جديد / {report.studentsExisting} موجود</span>
              <span>تسجيلات: {report.enrollmentsCreated}</span>
              <span>أسعار خاصة: {report.priceOverrides}</span>
            </div>
            {report.subjectsUsed.length > 0 && (
              <div className="text-xs pt-1">
                المواد: {report.subjectsUsed.map(s => `${s.name} (${s.groups} مجموعة · ${s.students} طالب · ${s.price})`).join(' · ')}
              </div>
            )}
            {report.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-emerald-200 max-h-28 overflow-y-auto">
                <div className="font-bold text-amber-800 mb-1">ملاحظات ({report.errors.length}):</div>
                {report.errors.slice(0, 30).map((e, i) => (
                  <div key={i} className="text-xs text-amber-800">• {e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------- فحص الجودة ---------- */}
        {quality && (
          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className={quality.score >= 90 ? 'text-emerald-600' : quality.score >= 70 ? 'text-amber-500' : 'text-red-500'} />
                <span className="text-sm font-bold text-gray-900">فحص جودة الداتا</span>
              </div>
              <div className="text-sm font-bold" style={{ color: quality.score >= 90 ? '#059669' : quality.score >= 70 ? '#d97706' : '#dc2626' }}>
                {quality.score}/100
              </div>
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
                    <b>{s.name}</b>: {s.groups} مجموعة · {s.students} طالب · {s.price}
                  </span>
                ))}
              </div>
            )}

            {quality.issues.length === 0 ? (
              <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                ✓ كل حاجة مترابطة صح — مفيش أي ملاحظات
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {quality.issues.map(issue => (
                  <div key={issue.code}
                    className={`text-xs rounded-lg px-3 py-2 border ${
                      issue.severity === 'error' ? 'bg-red-50 border-red-100 text-red-800'
                      : issue.severity === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800'
                      : 'bg-gray-50 border-gray-100 text-gray-600'
                    }`}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {issue.severity !== 'info' && <AlertTriangle size={12} />}
                      {issue.message} ({issue.count})
                      {issue.autoFixable && <span className="text-[10px] opacity-70">— يتصلح تلقائياً</span>}
                    </div>
                    <div className="opacity-75 mt-0.5">{issue.entities.slice(0, 5).join('، ')}{issue.count > 5 ? ' …' : ''}</div>
                  </div>
                ))}
              </div>
            )}

            {quality.issues.some(i => i.autoFixable) && (
              <button onClick={runAutoFix} disabled={fixing}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <Wand2 size={14} /> {fixing ? 'جاري الإصلاح…' : 'إصلاح المشاكل تلقائياً'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------- الأزرار ---------- */}
      <div className="flex justify-end gap-2 p-5 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
        <button onClick={onClose} disabled={busy}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {report ? 'إغلاق' : 'إلغاء'}
        </button>
        <button onClick={runImport} disabled={!parsed || busy}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}>
          <Upload size={16} />
          {busy ? 'جاري الاستيراد…' : 'استورد واربط كل حاجة'}
        </button>
      </div>
    </Modal>
  );
}
