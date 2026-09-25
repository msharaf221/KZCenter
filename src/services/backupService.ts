import { DB_VERSION } from '../data/database';
import { readSnapshot } from '../data/readers';
import type { StoreRecords } from '../data/schema';
import { BACKUP_STORES, type StoreName } from '../data/stores';
import { writeTransaction } from '../data/transactions';
import { backupKey, planBackupImport } from '../domain/backup/format';
import type { Settings } from '../domain/models';
import { setSettingsCache } from '../lib/settings';

export interface ExportOptions {
  /** Local restore may include password hashes. Cloud snapshots must pass false. */
  includeUsers?: boolean;
}

export async function exportAllData(opts: ExportOptions = {}): Promise<object> {
  const includeUsers = opts.includeUsers !== false;
  const stores: StoreName[] = [...BACKUP_STORES, 'settings', ...(includeUsers ? ['users' as const] : [])];
  const snapshot = await readSnapshot(stores, { includeDeleted: true });
  const payload: Record<string, unknown> = { version: DB_VERSION, exportedAt: new Date().toISOString(), includeUsers };
  for (const store of stores) {
    payload[backupKey(store)] = store === 'settings' ? snapshot.settings.find(row => row.id === 'main') : snapshot[store];
  }
  return payload;
}

export async function importAllData(data: Record<string, unknown>): Promise<void> {
  const plan = planBackupImport(data, [...BACKUP_STORES, 'users'], DB_VERSION);
  const stores = [...plan.tables.map(table => table.store as StoreName), ...(plan.settings ? ['settings' as const] : [])];
  if (!stores.length) return;
  await writeTransaction(stores, async tx => {
    for (const table of plan.tables) {
      const store = tx.objectStore(table.store as StoreName);
      await store.clear();
      for (const row of table.rows) await store.put(row as unknown as StoreRecords[StoreName]);
    }
    if (plan.settings) await tx.objectStore('settings').put(plan.settings as unknown as Settings);
  });
  // Billing must not continue using settings from before a restore.
  setSettingsCache(null);
}
