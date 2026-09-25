import dayjs from 'dayjs';
import { writeTransaction } from '../../data/transactions';
import { planMissingInstallments, type InstallmentMigrationReport } from '../../domain/maintenance/installments';
import { installmentState } from '../../lib/billing';
import { generateId } from '../../lib/ids';
import { withBillingTransaction } from '../billing/unitOfWork';

/** Derived status is updated from the same version that will be written, not an earlier read snapshot. */
export function markOverdueInstallments(): Promise<number> {
  return writeTransaction(['installments'], async tx => {
    const store = tx.objectStore('installments'), today = dayjs().format('YYYY-MM-DD'), now = new Date().toISOString();
    let updated = 0;
    for (const row of await store.getAll()) if (!row.deleted) {
      const status = installmentState(row, today);
      if (status !== row.status) { await store.put({ ...row, status, updatedAt: now }); updated++; }
    }
    return updated;
  });
}

/** Serialized with enrollment/collection/deletion; repeated or concurrent migration cannot duplicate plans. */
export function migrateInstallments(): Promise<InstallmentMigrationReport> {
  return withBillingTransaction(async unit => {
    const [enrollments, students, groups, courses, installments] = await Promise.all([
      unit.all('enrollments', { includeDeleted: true }), unit.all('students'), unit.all('groups'), unit.all('courses'), unit.all('installments'),
    ]);
    const plan = planMissingInstallments({ enrollments, students, groups, courses, installments }, new Date().toISOString());
    for (const row of plan.drafts) await unit.add('installments', { ...row, id: generateId() });
    for (const id of plan.studentIds) await unit.rebuild(id);
    return { enrollmentsProcessed: plan.enrollmentsProcessed, installmentsCreated: plan.drafts.length, studentsRecalculated: plan.studentIds.length };
  });
}
