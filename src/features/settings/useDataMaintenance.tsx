import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { IntegrityReport } from '../../domain/maintenance/integrity';
import type { QualityReport } from '../../domain/maintenance/qualityTypes';
import { useCommandTask } from '../../hooks/useCommandTask';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { notify } from '../../lib/notifications';
import type { SubjectPrices } from '../../lib/subjects';
import { repairCatalogData, repairDataLinks } from '../../services/commands/maintenance';
import { auditData } from '../../services/maintenance/quality';

export function useDataMaintenance(subjectPrices: SubjectPrices) {
  const { user } = useAuth();
  const task = useCommandTask();
  const { confirm, dialog } = useConfirmDialog();
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [operation, setOperation] = useState<'audit' | 'quality' | 'integrity' | null>(null);
  const run = (name: typeof operation, action: () => Promise<void>) => task.run(async () => {
    setOperation(name);
    try { await action(); } finally { if (task.isActive()) setOperation(null); }
  });
  const handleAudit = () => run('audit', async () => {
    setQuality(null);
    const result = await auditData();
    if (!task.isActive()) return;
    setQuality(result);
    if (result.issues.length) notify.info(`فيه ${result.issues.length} ملاحظة — النتيجة ${result.score}/100`);
    else notify.success('الداتا مترابطة صح — مفيش ملاحظات ✓');
  });
  const handleAutoFix = () => run('quality', async () => {
    if (!await confirm({ title: 'إصلاح المواد والأسعار', message: 'هيتم ربط المواد الناقصة وضبط أسعار الكورسات ذات السعر الصفري حسب أسعار المواد. الأقساط المسجلة والدفعات والكشوف المعتمدة مش هتتغير. يُفضّل الاحتفاظ بنسخة احتياطية.', confirmLabel: 'تأكيد الإصلاح' }) || !task.isActive()) return;
    setQuality(null); setIntegrityReport(null);
    const result = await repairCatalogData(user, subjectPrices, true);
    if (!task.isActive()) return;
    setQuality(result.quality);
    notify.success(`تم: ${result.report.coursesLinked} كورس اترابط · ${result.report.coursesRepriced} سعر اتظبط · ${result.report.groupsLinked} مجموعة · ${result.report.teachersLinked} مدرس`);
  });
  const handleIntegrityCheck = () => run('integrity', async () => {
    if (!await confirm({ title: 'إصلاح روابط البيانات', message: 'هيتم توحيد قوائم الطلاب والمجموعات حسب سجل التسجيلات، وتنظيف الروابط المفقودة، وتحديث الأرصدة المحفوظة. التسجيلات الملغاة أو المحوّلة مش هتترجع، والدفعات والأقساط المسجلة مش هتتغير.', confirmLabel: 'تأكيد الإصلاح' }) || !task.isActive()) return;
    setQuality(null); setIntegrityReport(null);
    const result = await repairDataLinks(user, true);
    if (!task.isActive()) return;
    setIntegrityReport(result);
    const count = result.staleEnrollments + result.staleGroupMembers;
    if (count) notify.success(`تم إصلاح ${count} رابط وإعادة حساب ${result.recalculatedStudents} طالب`);
    else notify.success('اكتمل فحص وإصلاح الروابط');
  });
  return { quality, integrityReport, busy: task.pending, auditing: operation === 'audit', autoFixing: operation === 'quality', checking: operation === 'integrity', handleAudit, handleAutoFix, handleIntegrityCheck, dialog };
}
