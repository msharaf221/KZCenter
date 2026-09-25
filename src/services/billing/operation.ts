import { RuleError } from '../../domain/errors';
import { withBillingTransaction, type BillingUnit } from './unitOfWork';

/** Expected rule failures preserve the legacy result contract; I/O failures abort and reject. */
export async function billingOperation<T extends { success: boolean; error?: string }>(work: (unit: BillingUnit) => Promise<T>) {
  try { return await withBillingTransaction(work); }
  catch (error) {
    if (error instanceof RuleError) return { success: false as const, error: error.message };
    throw error;
  }
}
