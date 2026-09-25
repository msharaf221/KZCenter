import { readAll } from '../../data/readers';
import { loadPayrollContext } from '../payroll/context';
import { getPayrollForPeriod } from '../payroll/records';

export async function loadPayrollPage(period: string) {
  const [context, records, expenses] = await Promise.all([
    loadPayrollContext(period),
    getPayrollForPeriod(period),
    readAll('expenses'),
  ]);
  return { context, records, expenses };
}
