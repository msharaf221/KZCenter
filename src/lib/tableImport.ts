/** Backwards-compatible public API. Production code imports the owning modules. */
export { detectField, looksLikeTable, mapHeaders } from '../domain/imports/tableHeaders';
export {
  parseGender,
  parseNumber,
  parseRow,
  parseTable,
  rowsFromCsv,
  rowsFromJson
} from '../domain/imports/tableParser';
export type { FieldKey, TableParseResult, TableRecord } from '../domain/imports/types';
export { parseAnyTable, rowsFromExcel } from '../services/imports/readFiles';
