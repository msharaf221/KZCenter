import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, Users, Layers, GraduationCap, BookOpen,
} from 'lucide-react';
import Modal from './ui/Modal';
import { useApp } from '../contexts/AppContext';
import { notify } from '../lib/notifications';
import { getContrastColor } from '../lib/utils';
import {
  parseSheetBuffer, importSheetIntoDb, SheetParseResult, SheetImportOptions,
  SheetImportReport, CourseStrategy,
} from '../lib/sheetImport';

interface Props {
  open: boolean;
  onClose: () => void;
  /** بيستدعي بعد نجاح الاستيراد (لتحديث القوائم) */
  onDone: () => void;
}

const STRATEGY_LABELS: { value: CourseStrategy; label: string; hint: string }[] = [
  { value: 'byType', label: 'كورس لكل نوع مجموعة', hint: 'مثال: s.r / اقرا / level / grammer' },
  { value: 'byTeacher', label: 'كورس لكل مدرس', hint: 'كل مدرس يبقى له كورس باسمه' },
  { value: 'single', label: 'كورس واحد للكل', hint: 'كله تحت كورس «Kids Zone»' },
];

/**
 * استيراد شيت إكسيل المركز:
 * كل تبويب = مدرس، وكل عمود = مجموعة (العنوان فيه اسم المجموعة واليوم والميعاد)،
 * وتحته أسماء الطلاب. الطالب اللي اسمه متكرر في أكتر من عمود بيتسجّل مرة واحدة
 * في كل مجموعاته (مش بيتعمله نسخة تانية).
 */
export default function SheetImportDialog({ open, onClose, onDone }: Props) {
  const { settings } = useApp();
  const primaryColor = settings?.primaryColor || '#6366f1';

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<SheetParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [opts, setOpts] = useState<SheetImportOptions>({
    courseStrategy: 'byType',
    coursePrice: 0,
    durationMonths: 1,
    phonePrefix: '0100000',
    maxStudents: 40,
  });
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [report, setReport] = useState<SheetImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);

  const coursesCount = useMemo(() => {
    if (!parsed) return 0;
    const set = new Set<string>();
    for (const g of parsed.groups) {
      if (opts.courseStrategy === 'single') set.add('Kids Zone');
      else if (opts.courseStrategy === 'byTeacher') set.add(g.teacherName);
      else set.add(g.name.includes(g.teacherName) ? g.teacherName : g.name.replace(/\([^)]*\)/g, '').replace(/\d+(\s*\/\s*\d+)?/g, '').trim());
    }
    return set.size;
  }, [parsed, opts.courseStrategy]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setReport(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const result = await parseSheetBuffer(buf);
      if (result.teachers.length === 0) {
        notify.error('مفيش مدرسين أو طلاب في الشيت — اتأكد إنه نفس شكل شيت المركز');
        setParsed(null);
      } else if (!result.looksLikeCenterSheet) {
        notify.error('الملف ده مش شيت المركز — العناوين لازم يكون فيها اليوم والميعاد (مثال: «s.r 1 السبت من 4/5»)');
        setParsed(null);
      } else {
        setParsed(result);
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
    setProgress({ done: 0, total: 1, label: 'جاري التحضير…' });
    try {
      const result = await importSheetIntoDb(parsed, opts, (done, total, label) => {
        if (done % 25 === 0 || done === total) setProgress({ done, total, label });
      });
      setProgress({ done: 1, total: 1, label: 'تم' });
      setReport(result);
      if (result.errors.length > 0) {
        notify.error(`تم الاستيراد مع ${result.errors.length} مشكلة`);
      } else {
        notify.success(
          `تم الاستيراد: ${result.teachersCreated + result.teachersExisting} مدرس، ` +
          `${result.groupsCreated + result.groupsExisting} مجموعة، ` +
          `${result.studentsCreated + result.studentsExisting} طالب`
        );
      }
      onDone();
    } catch (err) {
      notify.error(`حصل خطأ أثناء الاستيراد: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [parsed, opts, onDone]);

  const percent = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  const visibleGroups = parsed ? (showAllGroups ? parsed.groups : parsed.groups.slice(0, 12)) : [];

  return (
    <Modal isOpen={open} onClose={busy ? () => {} : onClose} title="استيراد شيت إكسيل" size="xl">
      <div className="p-5 space-y-4 overflow-y-auto">
        {/* ---------- اختيار الملف ---------- */}
        <div>
          <label
            className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              parsed ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <FileSpreadsheet size={22} className={parsed ? 'text-emerald-600' : 'text-gray-400'} />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                {parsing ? 'جاري قراءة الملف…' : fileName || 'اختار ملف الإكسيل (.xlsx)'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                كل تبويب = مدرس • كل عمود = مجموعة • تحته أسماء الطلاب
              </div>
            </div>
            {parsed && <CheckCircle2 size={20} className="text-emerald-600" />}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={busy}
              onChange={e => handleFile(e.target.files?.[0])}
              className="hidden"
            />
          </label>
        </div>

        {/* ---------- الإعدادات ---------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">طريقة إنشاء الكورسات</label>
            <select
              value={opts.courseStrategy}
              disabled={busy}
              onChange={e => setOpts(o => ({ ...o, courseStrategy: e.target.value as CourseStrategy }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            >
              {STRATEGY_LABELS.map(s => (
                <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">سعر الاشتراك الشهري للكورسات الجديدة</label>
            <input
              type="number"
              min={0}
              step={50}
              disabled={busy}
              value={opts.coursePrice}
              onChange={e => setOpts(o => ({ ...o, coursePrice: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              لو سبته صفر محدش هيكون عليه مديونية — تعدّله بعدين من صفحة الكورسات
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">بداية أرقام التليفونات (placeholder)</label>
            <input
              type="text"
              disabled={busy}
              value={opts.phonePrefix}
              onChange={e => setOpts(o => ({ ...o, phonePrefix: e.target.value.replace(/[^\d]/g, '') }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              هيتضاف عليها 4 أرقام تسلسلية: {opts.phonePrefix}0001، {opts.phonePrefix}0002 …
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">أقصى عدد طلاب في المجموعة</label>
            <input
              type="number"
              min={1}
              disabled={busy}
              value={opts.maxStudents}
              onChange={e => setOpts(o => ({ ...o, maxStudents: Math.max(1, Number(e.target.value) || 1) }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>
        </div>

        {/* ---------- معاينة ---------- */}
        {parsed && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: GraduationCap, label: 'مدرس', testId: 'stat-teachers', value: parsed.teachers.length },
                { icon: BookOpen, label: 'كورس', testId: 'stat-courses', value: coursesCount },
                { icon: Layers, label: 'مجموعة', testId: 'stat-groups', value: parsed.groups.length },
                { icon: Users, label: 'طالب', testId: 'stat-students', value: parsed.uniqueStudents.length },
              ].map(({ icon: Icon, label, testId, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <Icon size={18} className="mx-auto text-gray-400 mb-1" />
                  <div data-testid={testId} className="text-xl font-bold text-gray-900">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-600 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
              هيتم إنشاء <b>{parsed.totalSlots}</b> تسجيل.
              {' '}<b>{parsed.multiGroupStudents}</b> طالب موجودين في أكتر من مجموعة —
              كل واحد فيهم هيتعمله <b>ملف واحد بس</b> ويسجّل في كل مجموعاته.
            </div>

            {/* المجموعات */}
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-right text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">المدرس</th>
                      <th className="px-3 py-2 font-medium">المجموعة</th>
                      <th className="px-3 py-2 font-medium">اليوم</th>
                      <th className="px-3 py-2 font-medium">الميعاد</th>
                      <th className="px-3 py-2 font-medium">العدد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleGroups.map((g, i) => (
                      <tr key={`${g.teacherName}-${g.rawHeader}-${i}`} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-700">{g.teacherName}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{g.name}</td>
                        <td className="px-3 py-2 text-gray-600">{g.dayLabels.join(' و ') || '—'}</td>
                        <td className="px-3 py-2 text-gray-600" dir="ltr">
                          {g.startTime ? `${g.startTime} - ${g.endTime}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{g.students.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.groups.length > 12 && (
                <button
                  onClick={() => setShowAllGroups(v => !v)}
                  className="w-full py-2 text-xs text-gray-500 hover:bg-gray-50 border-t border-gray-100"
                >
                  {showAllGroups ? 'إخفاء' : `عرض كل المجموعات (${parsed.groups.length})`}
                </button>
              )}
            </div>

            {/* تنبيهات */}
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
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{ width: `${percent}%`, backgroundColor: primaryColor }}
              />
            </div>
          </div>
        )}

        {/* ---------- النتيجة ---------- */}
        {report && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-900 space-y-1">
            <div className="font-bold flex items-center gap-2">
              <CheckCircle2 size={16} /> تم الاستيراد
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <span>مدرسين: {report.teachersCreated} جديد / {report.teachersExisting} موجود</span>
              <span>كورسات: {report.coursesCreated}</span>
              <span>مجموعات: {report.groupsCreated} جديد / {report.groupsExisting} موجود</span>
              <span>طلاب: {report.studentsCreated} جديد / {report.studentsExisting} موجود</span>
              <span>تسجيلات: {report.enrollmentsCreated}</span>
              <span>اتخطّى: {report.enrollmentsSkipped}</span>
            </div>
            {report.errors.length > 0 && (
              <div className="mt-2 pt-2 border-t border-emerald-200 max-h-32 overflow-y-auto">
                <div className="font-bold text-amber-800 mb-1">مشاكل ({report.errors.length}):</div>
                {report.errors.slice(0, 50).map((e, i) => (
                  <div key={i} className="text-xs text-amber-800">• {e}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------- الأزرار ---------- */}
      <div className="flex justify-end gap-2 p-5 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {report ? 'إغلاق' : 'إلغاء'}
        </button>
        <button
          onClick={runImport}
          disabled={!parsed || busy}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
        >
          <Upload size={16} />
          {busy ? 'جاري الاستيراد…' : 'ابدأ الاستيراد'}
        </button>
      </div>
    </Modal>
  );
}
