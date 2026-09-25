import { transactionSnapshot, writeTransaction } from '../../data/transactions';
import { storedStudentTotals } from '../../domain/ledger/balance';
import { planIntegrity, type IntegrityReport } from '../../domain/maintenance/integrity';
import { generateId } from '../../lib/ids';

const STORES = ['students', 'groups', 'courses', 'teachers', 'enrollments', 'installments', 'payments', 'refunds'] as const;
/** A coherent repair: planning, all links and affected totals commit or abort together. */
export function runIntegrityFix(): Promise<IntegrityReport> {
  return writeTransaction([...STORES], async tx => {
    const data = await transactionSnapshot(tx, STORES, { includeDeleted: true });
    const now = new Date().toISOString();
    const plan = planIntegrity(data, now);
    for (const row of plan.studentPatches) await tx.objectStore('students').put(row);
    for (const row of plan.groupPatches) await tx.objectStore('groups').put(row);
    for (const row of plan.enrollmentPatches) await tx.objectStore('enrollments').put(row);
    for (const row of plan.newEnrollments) await tx.objectStore('enrollments').add({ ...row, id: generateId() });
    if (plan.affectedStudentIds.length) {
      const enrollments = await tx.objectStore('enrollments').getAll();
      const groups = await tx.objectStore('groups').getAll();
      for (const id of plan.affectedStudentIds) {
        const student = await tx.objectStore('students').get(id);
        if (!student || student.deleted) continue;
        const ledger = {
          installments: data.installments.filter(row => !row.deleted && row.studentId === id),
          payments: data.payments.filter(row => !row.deleted && row.studentId === id),
          refunds: data.refunds.filter(row => !row.deleted && row.studentId === id),
          enrollments: enrollments.filter(row => !row.deleted && row.studentId === id),
        };
        const totals = storedStudentTotals(student, ledger, groups.filter(row => !row.deleted), data.courses.filter(row => !row.deleted));
        await tx.objectStore('students').put({ ...student, totalPaid: totals.paid, totalOwed: totals.owed, updatedAt: now });
      }
    }
    return plan.report;
  });
}
