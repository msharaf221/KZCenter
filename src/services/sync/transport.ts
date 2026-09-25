import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseConfigured } from '../../data/cloud/client';
import { ensureSessionForClient } from '../cloud/session';
import { PAGE_SIZE } from './policy';
import type { CloudReady, SyncRemote, SyncRow } from './ports';

export async function prepareCloud(client = getSupabaseClient()): Promise<CloudReady> {
  if (!getSupabaseConfigured() || !client) {
    return { ok: false, error: 'Supabase غير مهيأ — أدخل الـ URL والـ anon key من الإعدادات → التخزين السحابي.' };
  }
  return ensureSessionForClient(client);
}

/** Stable ordering + paging; return accepted pages alongside any later-page failure. */
export async function fetchAllRows(
  table: string,
  client: SupabaseClient,
): Promise<{ rows: SyncRow[]; error?: string }> {
  const rows: SyncRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    if (!data?.length) break;
    rows.push(...(data as SyncRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return { rows };
}

/** Pin one client per run instead of switching projects in the middle of a pull. */
export function createCloudTransport(client = getSupabaseClient()): SyncRemote {
  return {
    prepare: () => prepareCloud(client),
    read: table => {
      if (!client) return Promise.resolve({ rows: [], error: 'Supabase غير مهيأ' });
      return fetchAllRows(table, client);
    },
    async write(table, rows, onConflict) {
      if (!client) return { error: 'Supabase غير مهيأ' };
      const { error } = await client.from(table).upsert(rows, { onConflict });
      return error ? { error: error.message } : {};
    },
  };
}
