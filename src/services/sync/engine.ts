import { CLOUD_TABLES } from '../../data/stores';
import { emptyReport, type SyncReport, type TableSyncResult } from '../../domain/sync/report';
import {
  decideMerge,
  stripInternalCloud,
  stripSensitive,
  toCamelCase,
  toSnakeCase,
  transformKeys,
} from '../../domain/sync/rows';
import { CONFLICT_TARGET, UPSERT_BATCH } from './policy';
import type { SyncLocal, SyncRemote } from './ports';

/** Sync orchestration has no SDK, notification, React or browser-storage dependency. */
export function createSyncEngine(local: SyncLocal, remote: SyncRemote) {
  return async function synchronize(direction: 'push' | 'pull', onReady?: () => void): Promise<SyncReport> {
    const startedAt = new Date().toISOString();
    const report = emptyReport(direction, startedAt);
    const finish = () => {
      report.finishedAt = new Date().toISOString();
      report.durationMs = Date.now() - new Date(startedAt).getTime();
      return report;
    };
    try {
      const ready = await remote.prepare();
      if (!ready.ok) {
        report.ok = false;
        report.errors.push(ready.error || 'تعذّر تجهيز الاتصال بالسحابة');
        return finish();
      }
    } catch (error) {
      report.ok = false;
      report.errors.push(String(error));
      return finish();
    }
    onReady?.();

    for (const table of CLOUD_TABLES) {
      const result: TableSyncResult = { table, pushed: 0, pulled: 0, skipped: 0 };
      try {
        if (direction === 'push') {
          const rows = (await local.read(table)).map(row =>
            transformKeys(stripSensitive(stripInternalCloud(row)), toSnakeCase),
          );
          for (let index = 0; index < rows.length; index += UPSERT_BATCH) {
            const batch = rows.slice(index, index + UPSERT_BATCH);
            const { error } = await remote.write(table, batch, CONFLICT_TARGET[table] || 'id');
            if (error) {
              result.error = error;
              break;
            }
            result.pushed += batch.length;
          }
        } else {
          const { rows, error } = await remote.read(table);
          if (error) result.error = error;
          const byId = new Map((await local.read(table)).map(row => [String(row.id), row]));
          for (const raw of rows) {
            const row = stripSensitive(stripInternalCloud(transformKeys(raw, toCamelCase)));
            const id = String(row.id ?? '');
            if (!id) continue;
            if (decideMerge(byId.get(id), row) === 'skip') {
              result.skipped++;
              continue;
            }
            await local.write(table, row);
            // Repeated rows/pages must compare against the most recent accepted value.
            byId.set(id, row);
            result.pulled++;
          }
        }
      } catch (error) {
        result.error = String(error);
      }
      report.tables.push(result);
      report.total += result.pushed + result.pulled;
      if (result.error) {
        report.ok = false;
        report.errors.push(`${table}: ${result.error}`);
      }
    }
    return finish();
  };
}
