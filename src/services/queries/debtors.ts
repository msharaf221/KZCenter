import { refreshDebtAlert } from '../../lib/debtAlerts';
import { getDebtors } from '../balanceService';
import { markOverdueInstallments } from '../maintenanceService';

export async function loadDebtors() {
  await markOverdueInstallments();
  const debtors = await getDebtors();
  void refreshDebtAlert(true);
  return debtors;
}
