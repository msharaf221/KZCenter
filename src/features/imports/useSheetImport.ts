import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { subjectOfParsedGroup } from '../../domain/imports/matrixParser';
import type { SheetImportOptions, SheetImportReport } from '../../domain/imports/types';
import { notify } from '../../lib/notifications';
import { SUBJECTS, type SubjectId } from '../../lib/subjects';
import { getSubjectPrices } from '../../lib/subjectSync';
import { importSheetIntoDb } from '../../services/imports/sheet';
import { readSheetPreview } from './readPreview';
import { useFilePreview } from './useFilePreview';

export function useSheetImport(open: boolean, onDone: () => void) {
  const { settings } = useApp();

  const primaryColor = settings?.primaryColor || '#6366f1';

  const fileRef = useRef<HTMLInputElement>(null);

  const [opts, setOpts] = useState<SheetImportOptions>({
    courseStrategy: 'bySubject',
    coursePrice: 0,
    durationMonths: 1,
    phonePrefix: '0100000',
    maxStudents: 40,
    useSubjectPrices: true,
  });

  /** أسعار المواد الفعلية (من الإعدادات) — بتتحمّل مرة عند فتح النافذة */
  const [prices, setPrices] = useState<Record<SubjectId, number> | null>(null);

  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const [report, setReport] = useState<SheetImportReport | null>(null);

  const importing = useRef(false);
  const [busy, setBusy] = useState(false);

  const [showAllGroups, setShowAllGroups] = useState(false);

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

  /** توزيع مجموعات الشيت على المواد (معاينة قبل الاستيراد) */
  const { parsed, parsing, fileName, selectFile } = useFilePreview(open, readSheetPreview);
  const subjectBreakdown = useMemo(() => {
    if (!parsed)
      return { rows: [] as { id: SubjectId; name: string; icon: string; groups: number; price: number }[], unknown: 0 };
    const counts = new Map<SubjectId, number>();
    let unknown = 0;
    for (const g of parsed.groups) {
      const subject = subjectOfParsedGroup(g);
      if (!subject) {
        unknown++;
        continue;
      }
      counts.set(subject.id, (counts.get(subject.id) || 0) + 1);
    }
    const rows = SUBJECTS.filter(s => counts.has(s.id)).map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      groups: counts.get(s.id) || 0,
      price: prices?.[s.id] ?? s.monthlyPrice,
    }));
    return { rows, unknown };
  }, [parsed, prices]);

  const coursesCount = useMemo(() => {
    if (!parsed) return 0;
    const set = new Set<string>();
    for (const g of parsed.groups) {
      if (opts.courseStrategy === 'single') set.add('Kids Zone');
      else if (opts.courseStrategy === 'byTeacher') set.add(g.teacherName);
      else if (opts.courseStrategy === 'bySubject') {
        const subject = subjectOfParsedGroup(g);
        set.add(
          subject
            ? subject.name
            : g.name.includes(g.teacherName)
              ? g.teacherName
              : g.name
                  .replace(/\([^)]*\)/g, '')
                  .replace(/\d+(\s*\/\s*\d+)?/g, '')
                  .trim(),
        );
      } else
        set.add(
          g.name.includes(g.teacherName)
            ? g.teacherName
            : g.name
                .replace(/\([^)]*\)/g, '')
                .replace(/\d+(\s*\/\s*\d+)?/g, '')
                .trim(),
        );
    }
    return set.size;
  }, [parsed, opts.courseStrategy]);

  const handleFile = (file: File | undefined) => {
    if (!file || busy) return;
    setReport(null);

    selectFile(file);
  };

  const runImport = useCallback(async () => {
    if (!parsed || importing.current) return;
    importing.current = true;
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
            `${result.studentsCreated + result.studentsExisting} طالب`,
        );
      }
      onDone();
    } catch (err) {
      notify.error(`حصل خطأ أثناء الاستيراد: ${(err as Error).message}`);
    } finally {
      importing.current = false;
      setBusy(false);
    }
  }, [parsed, opts, onDone]);

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const visibleGroups = parsed ? (showAllGroups ? parsed.groups : parsed.groups.slice(0, 12)) : [];
  return {
    primaryColor,
    fileRef,
    fileName,
    parsed,
    parsing,
    opts,
    setOpts,
    prices,
    progress,
    report,
    busy,
    showAllGroups,
    setShowAllGroups,
    subjectBreakdown,
    coursesCount,
    handleFile,
    runImport,
    percent,
    visibleGroups,
  };
}
