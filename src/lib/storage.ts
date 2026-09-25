/** Backwards-compatible public API. Production code imports the owning modules. */
export { CLOUD_TABLES, NEVER_SYNC_TABLES, type TableName } from '../data/stores';
export { formatSyncReport } from '../domain/sync/report';
export type { SyncReport, TableSyncResult } from '../domain/sync/report';
export {
  INTERNAL_CLOUD_FIELDS,
  SENSITIVE_FIELDS,
  decideMerge,
  stripInternalCloud,
  stripSensitive,
  toCamelCase,
  toSnakeCase,
  transformKeys
} from '../domain/sync/rows';
export type { MergeDecision } from '../domain/sync/rows';
export { syncCloudToLocal, syncLocalToCloud } from '../services/sync/actions';
export { CONFLICT_TARGET, PAGE_SIZE, UPSERT_BATCH, isTableSynced } from '../services/sync/policy';
export { prepareCloud } from '../services/sync/transport';
