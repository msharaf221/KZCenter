import { readSnapshot } from '../../data/readers';

export async function loadReportData() {
  const snapshot = await readSnapshot(['students', 'teachers', 'courses', 'groups', 'payments', 'expenses', 'refunds', 'installments']);
  snapshot.refunds.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return snapshot;
}
