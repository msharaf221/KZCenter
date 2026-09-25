import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import type { TableImportOptions, TableImportReport } from '../../domain/imports/types';
import type { QualityReport } from '../../domain/maintenance/qualityTypes';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { notify } from '../../lib/notifications';
import { getSubjectPrices } from '../../lib/subjectSync';
import { SUBJECTS, type SubjectId } from '../../lib/subjects';
import { repairCatalogData } from '../../services/commands/maintenance';
import { linkOrphans } from '../../services/imports/linking';
import { importTableIntoDb } from '../../services/imports/table';
import { auditData } from '../../services/maintenance/quality';
import { readTablePreview } from './readPreview';
import { useFilePreview } from './useFilePreview';

export function useTableImport(open: boolean, onDone: () => void) {
  const { settings } = useApp();
  const { user, can } = useAuth();
  const { confirm, dialog: repairDialog } = useConfirmDialog();
  const canRepair = can('settings', 'edit');

  const primaryColor = settings?.primaryColor || '#6366f1';

  const fileRef = useRef<HTMLInputElement>(null);

  const importing = useRef(false);
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
    let active = true;
    getSubjectPrices()
      .then(p => {
        if (!active) return;
        setPrices(p);
        setOpts(o => ({ ...o, subjectPrices: p }));
      })
      .catch(() => {
        if (active) notify.error('تعذّر تحميل أسعار المواد');
      });
    return () => {
      active = false;
    };
  }, [open]);

  const { parsed, parsing, fileName, selectFile } = useFilePreview(open, readTablePreview);
  const handleFile = (file: File | undefined) => {
    if (!file || importing.current) return;
    setReport(null);
    setQuality(null);
    selectFile(file);
  };

  const announceCompletion = useCallback(() => {
    try { onDone(); } catch (error) { console.error('Import view refresh failed after commit:', error); notify.warning('تم الحفظ لكن تعذّر تحديث العرض. أعد تحميل الصفحة.'); }
  }, [onDone]);

  const runImport = useCallback(async () => {
    if (!parsed || importing.current) return;
    importing.current = true;
    setBusy(true);
    setReport(null);
    setQuality(null);
    setProgress({ done: 0, total: 1, label: 'جاري التحضير…' });
    let applied = false;
    try {
      const result = await importTableIntoDb(parsed.records, opts, (done, total, label) => {
        if (done % 20 === 0 || done === total) setProgress({ done, total, label });
      });
      applied = true;
      setReport(result);
      // ربط أي كيانات قديمة فضلت من غير مادة
      await linkOrphans();
      setProgress({ done: 1, total: 1, label: 'جاري الفحص…' });
      setQuality(await auditData());
      setProgress({ done: 1, total: 1, label: 'تم' });

      if (result.errors.length > 0) {
        notify.error(`تم الاستيراد مع ${result.errors.length} ملاحظة`);
      } else {
        notify.success(
          `تم: ${result.studentsCreated} طالب · ${result.groupsCreated} مجموعة · ` +
          `${result.enrollmentsCreated} تسجيل`,
        );
      }
    } catch (err) {
      if (applied) { setProgress({ done: 1, total: 1, label: 'تم الاستيراد — الفحص غير مكتمل' }); notify.warning('تم تطبيق الاستيراد لكن تعذّر استكمال فحص البيانات. لا تعيد الاستيراد؛ أعد الفحص من الإعدادات.'); }
      else notify.error(`حصل خطأ أثناء الاستيراد: ${(err as Error).message}`);
    } finally {
      importing.current = false;
      setBusy(false);
    }
    if (applied) announceCompletion();
  }, [parsed, opts, announceCompletion]);

  const runAutoFix = useCallback(async () => {
    if (importing.current || !canRepair) return;
    importing.current = true;
    setFixing(true);
    try {
      if (!await confirm({ title: 'إصلاح المواد والأسعار', message: 'هيتم ربط المواد الناقصة وضبط أسعار الكورسات ذات السعر الصفري. الاشتراكات والدفعات المسجلة مش هتتغير.', confirmLabel: 'تأكيد الإصلاح' })) return;
      const result = await repairCatalogData(user, prices || undefined, true);
      setQuality(result.quality);
      notify.success(`تم الإصلاح: ${result.report.coursesLinked} كورس اترابط · ${result.report.coursesRepriced} سعر · ${result.report.groupsLinked} مجموعة · ${result.report.teachersLinked} مدرس`);
      announceCompletion();
    } catch { notify.error('حصل خطأ أثناء الإصلاح؛ لم يتم حفظ تعديلات جزئية'); }
    finally { importing.current = false; setFixing(false); }
  }, [prices, announceCompletion, user, canRepair, confirm]);

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

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
  return {
    primaryColor, canRepair, repairDialog,
    fileRef,
    fileName,
    parsed,
    parsing,
    busy,
    progress,
    report,
    quality,
    fixing,
    prices,
    showAllRows,
    setShowAllRows,
    opts,
    setOpts,
    handleFile,
    runImport,
    runAutoFix,
    percent,
    subjectRows,
    withoutSubject,
    visibleRows,
  };
}
