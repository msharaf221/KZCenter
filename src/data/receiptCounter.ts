import { nextCounterValue, receiptYear } from '../domain/maintenance/receiptNumbers';
import type { Counter } from '../domain/models';
import { counterId, formatReceiptNo } from '../domain/receipts';

interface CounterStore {
  get(key: string): Promise<Counter | undefined>;
  put(row: Counter): Promise<IDBValidKey>;
}
/** Allocate inside the caller's payment transaction, so failures roll back the counter too. */
export async function allocateReceiptNumber(store: CounterStore, date: string, prefix?: string): Promise<string> {
  const year = receiptYear(date);
  const id = counterId(date, prefix);
  const existing = await store.get(id);
  const value = nextCounterValue(existing ? existing.value : 0);
  await store.put({ id, value, updatedAt: new Date().toISOString() });
  return formatReceiptNo({ prefix: prefix || '', year, seq: value });
}
