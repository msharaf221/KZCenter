/** Backwards-compatible public API. Production code imports the owning modules. */
export { extractGroupName, isPlaceholderHeader, parseDays, parseTimeRange } from '../domain/imports/matrixHeaders';
export { courseFamily, subjectOfParsedGroup } from '../domain/imports/matrixParser';
export { extractPhone, foldArabic, guessGender } from '../domain/imports/normalization';
export { DEFAULT_IMPORT_OPTIONS } from '../domain/imports/options';
export type {
  CourseStrategy,
  ParsedGroup,
  SheetImportOptions,
  SheetImportReport,
  SheetParseResult,
  StudentMeta,
  TimeRange
} from '../domain/imports/types';
export { parseSheetBuffer } from '../services/imports/readFiles';
export { importSheetIntoDb } from '../services/imports/sheet';
