import { readAll } from '../data/readers';
import { recalculateStudentTotalPaid } from './balanceService';
import { markOverdueInstallments, migrateInstallments } from './maintenanceService';

let pending: Promise<void> | null = null;

/** Existing maintenance, coalesced for simultaneous mounts. No new migration flags or schema. */
export function runStartupMaintenance(): Promise<void> {
  if (pending) return pending;
  const work = maintain().finally(() => {
    if (pending === work) pending = null;
  });
  pending = work;
  return work;
}

async function maintain(): Promise<void> {
  if (!localStorage.getItem('migration_installments_v1')) {
    await migrateInstallments();
    localStorage.setItem('migration_installments_v1', 'true');
  }

  await markOverdueInstallments();

  if (!localStorage.getItem('migration_balances_v1')) {
    const students = await readAll('students');
    for (let i = 0; i < students.length; i++) {
      await recalculateStudentTotalPaid(students[i].id);
      // Yield on large legacy datasets, just as the previous dashboard loader did.
      if (i % 10 === 9) await new Promise(resolve => setTimeout(resolve, 0));
    }
    localStorage.setItem('migration_balances_v1', 'true');
  }
}
