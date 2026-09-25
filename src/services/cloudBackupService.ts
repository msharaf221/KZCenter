import { getSupabaseClient, getSupabaseConfigured } from '../data/cloud/client';
import { stripSensitive, stripInternalCloud } from '../domain/sync/rows';
import { exportAllData } from './backupService';
import { createSyncEngine } from './sync/engine';
import { createCloudTransport, prepareCloud } from './sync/transport';
import type { SyncRow } from './sync/ports';

/** Cloud snapshots retain the historic export shape but never contain local credentials. */
export function cloudBackupSnapshot(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => key !== 'users')
      .map(([key, value]) => {
        const clean = (row: unknown) =>
          row && typeof row === 'object' ? stripSensitive(stripInternalCloud(row as SyncRow)) : row;
        return [key, key === 'includeUsers' ? false : Array.isArray(value) ? value.map(clean) : clean(value)];
      }),
  );
}

export async function backupToCloud(): Promise<{ success: boolean; size: number; error?: string }> {
  const client = getSupabaseClient();
  if (!getSupabaseConfigured() || !client)
    return { success: false, size: 0, error: 'Supabase غير مهيأ. يرجى إعداد الاتصال من صفحة الإعدادات.' };
  const ready = await prepareCloud(client);
  if (!ready.ok) return { success: false, size: 0, error: ready.error };
  try {
    const snapshot = cloudBackupSnapshot((await exportAllData({ includeUsers: false })) as Record<string, unknown>);
    const json = JSON.stringify(snapshot);
    const size = new Blob([json]).size;
    const { error } = await client
      .from('backups')
      .insert({ backup_date: new Date().toISOString(), size_bytes: size, status: 'success', data_snapshot: json });
    if (error) console.warn('Backups table not found, syncing data directly...');
    const run = createSyncEngine(
      {
        async read(table) {
          const value = snapshot[table === 'inventory_transactions' ? 'inventoryTransactions' : table];
          return Array.isArray(value)
            ? (value as SyncRow[])
            : value && typeof value === 'object'
              ? [value as SyncRow]
              : [];
        },
        async write() {
          throw new Error('Backup snapshots are read-only');
        },
      },
      createCloudTransport(client),
    );
    const report = await run('push');
    if (!report.ok)
      return {
        success: false,
        size,
        error: `تعذّر رفع بعض الجداول للسحابة — ${report.errors.slice(0, 3).join(' | ')}`,
      };
    return { success: true, size };
  } catch (error) {
    return { success: false, size: 0, error: String(error) };
  }
}
