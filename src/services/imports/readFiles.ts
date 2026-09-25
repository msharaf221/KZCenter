import { readExcelSheets } from '../../data/files/excel';
import { parseSheetRows } from '../../domain/imports/matrixParser';
import { foldArabic, normalize } from '../../domain/imports/normalization';
import { looksLikeTable } from '../../domain/imports/tableHeaders';
import { parseTable, rowsFromCsv, rowsFromJson } from '../../domain/imports/tableParser';
import type { SheetParseResult, TableParseResult } from '../../domain/imports/types';

/**
 * قراءة كل تبويبات ملف Excel كجداول.
 * بيدوّر على صف العناوين في أول ٥ صفوف (الشيتات بتبدأ بعنوان/لوجو أحياناً).
 */
export async function rowsFromExcel(
  data: ArrayBuffer | Uint8Array,
): Promise<{ headers: string[]; rows: string[][]; sheetName: string }[]> {
  const sheets = await readExcelSheets(data, { dateOnly: true, trimCells: true });
  return sheets
    .filter(sheet => sheet.rows.length >= 2)
    .map(sheet => {
      const found = sheet.rows.findIndex((row, index) => index < 5 && looksLikeTable(row));
      const headerIndex = found === -1 ? 0 : found;
      return {
        sheetName: normalize(sheet.name),
        headers: sheet.rows[headerIndex],
        rows: sheet.rows.slice(headerIndex + 1),
      };
    });
}

/**
 * قراءة ملف بأي صيغة (xlsx / csv / json) وإرجاع أفضل نتيجة.
 * لو الملف Excel بأكتر من تبويب، بنجمّع كل التبويبات اللي شكلها جداول سجلات.
 */
export async function parseAnyTable(file: {
  name: string;
  buffer: ArrayBuffer;
  text?: string;
}): Promise<TableParseResult> {
  const ext = file.name.toLowerCase().split('.').pop() || '';

  if (ext === 'json') {
    const text = file.text ?? new TextDecoder().decode(file.buffer);
    const { headers, rows } = rowsFromJson(JSON.parse(text));
    return parseTable(headers, rows);
  }

  if (ext === 'csv' || ext === 'txt') {
    const text = file.text ?? new TextDecoder().decode(file.buffer);
    const { headers, rows } = rowsFromCsv(text);
    return parseTable(headers, rows);
  }

  const sheets = await rowsFromExcel(file.buffer);
  const parsedSheets = sheets.map(s => parseTable(s.headers, s.rows));
  const usable = parsedSheets.filter(p => p.looksLikeTable);

  if (usable.length === 0) {
    return (
      parsedSheets[0] ?? {
        records: [],
        detectedFields: [],
        unknownHeaders: [],
        teachers: [],
        groups: [],
        subjects: [],
        uniqueStudents: 0,
        skippedRows: 0,
        warnings: ['الملف مش شكله جدول سجلات'],
        looksLikeTable: false,
      }
    );
  }

  // دمج كل التبويبات الصالحة في نتيجة واحدة
  const merged: TableParseResult = {
    records: usable.flatMap(p => p.records),
    detectedFields: [...new Set(usable.flatMap(p => p.detectedFields))],
    unknownHeaders: [...new Set(usable.flatMap(p => p.unknownHeaders))],
    teachers: [...new Set(usable.flatMap(p => p.teachers))],
    groups: [...new Set(usable.flatMap(p => p.groups))],
    subjects: [...new Set(usable.flatMap(p => p.subjects))],
    uniqueStudents: 0,
    skippedRows: usable.reduce((sum, p) => sum + p.skippedRows, 0),
    warnings: [...new Set(usable.flatMap(p => p.warnings))],
    looksLikeTable: true,
  };
  merged.uniqueStudents = new Set(merged.records.map(r => foldArabic(r.studentName.toLowerCase()))).size;

  return merged;
}

export async function parseSheetBuffer(data: ArrayBuffer | Uint8Array): Promise<SheetParseResult> {
  return parseSheetRows(await readExcelSheets(data));
}
