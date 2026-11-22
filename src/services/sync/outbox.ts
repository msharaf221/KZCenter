import { CLOUD_TABLES } from '../../data/stores';
import {
  acknowledgeSyncOutbox,
  deferSyncOutbox,
  readRowForSync,
  readSyncOutboxBatch,
  type SyncOutboxEntry,
} from '../../data/syncOutbox';
import { stripInternalCloud, stripSensitive, toSnakeCase, transformKeys } from '../../domain/sync/rows';
import { CONFLICT_TARGET, UPSERT_BATCH } from './policy';
import type { SyncRemote, SyncRow } from './ports';
import { createCloudTransport } from './transport';

export interface OutboxSyncReport {
  ok: boolean;
  attempted: number;
  synchronized: number;
  pending: number;
  errors: string[];
}

const EMPTY_REPORT: OutboxSyncReport = { ok: true, attempted: 0, synchronized: 0, pending: 0, errors: [] };
let activeFlush: Promise<OutboxSyncReport> | null = null;

/** Flush only locally changed rows. Repeated calls in one renderer share a single run. */
export function flushSyncOutbox(remote: SyncRemote = createCloudTransport()): Promise<OutboxSyncReport> {
  if (activeFlush) return activeFlush;
  const work = flush(remote).finally(() => {
    if (activeFlush === work) activeFlush = null;
  });
  activeFlush = work;
  return work;
}

async function flush(remote: SyncRemote): Promise<OutboxSyncReport> {
  const entries = await readSyncOutboxBatch(UPSERT_BATCH);
  if (!entries.length) return { ...EMPTY_REPORT };

  const report: OutboxSyncReport = { ...EMPTY_REPORT, attempted: entries.length };
  let ready;
  try {
    ready = await remote.prepare();
  } catch (error) {
    ready = { ok: false, error: String(error) };
  }
  if (!ready.ok) {
    const reason = ready.error || 'تعذّر تسجيل الدخول إلى السحابة';
    report.ok = false;
    report.errors.push(reason);
    await deferEntries(entries, reason);
    report.pending = entries.length;
    return report;
  }

  const tableOrder = new Map(CLOUD_TABLES.map((table, index) => [table, index]));
  const ordered = [...entries].sort((a, b) => (tableOrder.get(a.table)! - tableOrder.get(b.table)!) || a.updatedAt.localeCompare(b.updatedAt));
  const grouped = new Map<string, SyncOutboxEntry[]>();
  for (const entry of ordered) {
    const groupKey = `${entry.table}:${entry.operation}`;
    const group = grouped.get(groupKey) || [];
    group.push(entry);
    grouped.set(groupKey, group);
  }

  for (const rows of grouped.values()) {
    const first = rows[0];
    if (first.operation === 'delete') {
      await flushDeletes(remote, rows, report);
      continue;
    }

    for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
      const batch = rows.slice(index, index + UPSERT_BATCH);
      const localRows = await Promise.all(batch.map(entry => readRowForSync(entry.table, entry.rowId)));
      const visible = batch.flatMap((entry, rowIndex) => {
        const row = localRows[rowIndex] as SyncRow | undefined;
        // A hard delete can supersede an earlier upsert before it leaves the queue.
        return row ? [{ entry, row }] : [];
      });
      const missing = batch.filter(entry => !visible.some(item => item.entry.id === entry.id));
      if (missing.length) await flushDeletes(remote, missing, report);
      if (!visible.length) continue;

      const payload = visible.map(({ row }) =>
        transformKeys(stripSensitive(stripInternalCloud(row)), toSnakeCase),
      );
      let result: { error?: string };
      try {
        result = await remote.write(first.table, payload, CONFLICT_TARGET[first.table] || 'id');
      } catch (error) {
        result = { error: String(error) };
      }
      if (result.error) {
        report.ok = false;
        report.errors.push(`${first.table}: ${result.error}`);
        await deferEntries(visible.map(item => item.entry), result.error);
        continue;
      }
      for (const item of visible) {
        try {
          if (await acknowledgeSyncOutbox(item.entry.id, item.entry.version)) report.synchronized++;
        } catch (error) {
          report.ok = false;
          report.errors.push(`${first.table}: تعذّر تأكيد المزامنة (${String(error)})`);
        }
      }
    }
  }

  report.pending = Math.max(0, report.attempted - report.synchronized);
  return report;
}

async function flushDeletes(remote: SyncRemote, entries: SyncOutboxEntry[], report: OutboxSyncReport): Promise<void> {
  for (let index = 0; index < entries.length; index += UPSERT_BATCH) {
    const batch = entries.slice(index, index + UPSERT_BATCH);
    let result: { error?: string };
    try {
      if (remote.removeMany) {
        result = await remote.removeMany(batch[0].table, batch.map(entry => entry.rowId));
      } else if (remote.remove) {
        result = {};
        for (const entry of batch) {
          const removed = await remote.remove(entry.table, entry.rowId);
          if (removed.error) { result = removed; break; }
        }
      } else {
        result = { error: 'وسيلة حذف الصفوف غير متاحة في ناقل السحابة' };
      }
    } catch (error) {
      result = { error: String(error) };
    }
    if (result.error) {
      report.ok = false;
      report.errors.push(`${batch[0].table}: ${result.error}`);
      await deferEntries(batch, result.error);
      continue;
    }
    for (const entry of batch) {
      try {
        if (await acknowledgeSyncOutbox(entry.id, entry.version)) report.synchronized++;
      } catch (error) {
        report.ok = false;
        report.errors.push(`${entry.table}: تعذّر تأكيد الحذف (${String(error)})`);
      }
    }
  }
}

async function deferEntries(entries: SyncOutboxEntry[], reason: string): Promise<void> {
  await Promise.all(entries.map(entry => deferSyncOutbox(entry.id, entry.version, reason).catch(error => {
    console.error(`Failed to defer ${entry.table}/${entry.rowId} sync:`, error);
  })));
}
