/** Backwards-compatible payroll API. Calculations are independent of storage and UI. */

export {
  PAY_MODEL_LABEL,
  describeTeacherPay,
  isPayrollPeriod,
  isPercentageModel,
  validateTeacherPaySettings
} from '../domain/payroll/settings';

export type { GroupProfit, PayrollContext, TeacherPaySettings, TeacherPayrollCalc } from '../domain/payroll/types';

export { updateTeacherPaySettings } from '../services/payroll/settings';

export {
  calcTeacherPayroll,
  countDeliveredSessions,
  groupSubscriptionLines,
  sumGroupCollected
} from '../domain/payroll/calculate';

export { calcPayrollForPeriod, loadPayrollContext } from '../services/payroll/context';

export { findPayrollRecord, getPayrollForPeriod, payPayroll, savePayrollRecord } from '../services/payroll/records';

export { addTeacherAdvance, getTeacherAdvances, settleAdvancesAgainst } from '../services/payroll/advances';

export { calcGroupProfitability } from '../services/payroll/profitability';
