import { requireRule } from '../../domain/errors';
import type { SubjectId } from '../../lib/subjects';
import { runIntegrityFix } from '../maintenance/integrity';
import { repairQuality } from '../maintenance/quality';
import { commandAudit, requirePermission, type Actor } from './access';

export async function repairDataLinks(actor: Actor, confirmed: boolean) {
  requirePermission(actor, 'settings', 'edit');
  requireRule(confirmed, 'يجب تأكيد إصلاح الروابط أولاً');
  const report = await runIntegrityFix();
  commandAudit(actor, { action: 'update', entity: 'maintenance', details: `إصلاح الروابط: ${report.staleEnrollments} تسجيل، ${report.staleGroupMembers} عضوية، ${report.recalculatedStudents} رصيد` });
  return report;
}
export async function repairCatalogData(actor: Actor, prices: Partial<Record<SubjectId, number>> | undefined, confirmed: boolean) {
  requirePermission(actor, 'settings', 'edit');
  requireRule(confirmed, 'يجب تأكيد الإصلاح التلقائي أولاً');
  const result = await repairQuality(prices);
  commandAudit(actor, { action: 'update', entity: 'maintenance', details: `إصلاح المواد والأسعار: ${result.report.coursesLinked} كورس، ${result.report.coursesRepriced} سعر، ${result.report.groupsLinked} مجموعة، ${result.report.teachersLinked} مدرس` });
  return result;
}
