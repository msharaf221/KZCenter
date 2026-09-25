/** Backwards-compatible public API. Production code imports the owning modules. */
export { normalizePhone } from '../domain/imports/normalization';
export { DEFAULT_TABLE_IMPORT_OPTIONS } from '../domain/imports/options';
export type { TableImportOptions, TableImportReport } from '../domain/imports/types';
export { linkOrphans } from '../services/imports/linking';
export { importTableIntoDb } from '../services/imports/table';
