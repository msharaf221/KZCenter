import type { SheetImportOptions, TableImportOptions } from './types';

export const DEFAULT_IMPORT_OPTIONS: SheetImportOptions = {
  courseStrategy: 'bySubject',
  coursePrice: 0,
  durationMonths: 1,
  phonePrefix: '0100000',
  maxStudents: 40,
  useSubjectPrices: true,
  subjectPrices: null,
};

export const DEFAULT_TABLE_IMPORT_OPTIONS: TableImportOptions = {
  useSubjectPrices: true,
  subjectPrices: null,
  fallbackPrice: 0,
  phonePrefix: '0100000',
  maxStudents: 40,
  rowPriceAsOverride: true,
};
