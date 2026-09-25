import { readSnapshot } from '../../data/readers';
import { transactionSnapshot, writeTransaction } from '../../data/transactions';
import { qualityReport } from '../../domain/maintenance/quality';
import { planQualityRepair } from '../../domain/maintenance/qualityRepair';
import type { SubjectId } from '../../lib/subjects';

const STORES = ['students', 'teachers', 'courses', 'groups', 'enrollments', 'installments'] as const;
export async function auditData() { return qualityReport(await readSnapshot(STORES)); }

/** Report and repair are calculated before commit; a follow-up read cannot turn a committed repair into a failure. */
export function repairQuality(prices?: Partial<Record<SubjectId, number>>) {
  return writeTransaction([...STORES], async tx => {
    const plan = planQualityRepair(await transactionSnapshot(tx, STORES), new Date().toISOString(), prices);
    for (const row of plan.coursePatches) await tx.objectStore('courses').put(row);
    for (const row of plan.groupPatches) await tx.objectStore('groups').put(row);
    for (const row of plan.teacherPatches) await tx.objectStore('teachers').put(row);
    return { report: plan.report, quality: plan.quality };
  });
}
export async function autoFix(prices?: Partial<Record<SubjectId, number>>) { return (await repairQuality(prices)).report; }
