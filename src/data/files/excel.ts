import type * as ExcelJS from 'exceljs';

export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
}

export interface ExcelReadOptions {
  /** Matrix sheets historically retain timestamps; flat tables retain dates only. */
  dateOnly?: boolean;
  trimCells?: boolean;
}

export function excelCellText(value: ExcelJS.CellValue, dateOnly = false): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return dateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map(part => part.text ?? '').join('');
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text;
  if (typeof value === 'object' && 'result' in value) return excelCellText(value.result, dateOnly);
  return String(value);
}

/** The only Excel decoder. It preserves sparse columns and sliced Uint8Array boundaries. */
export async function readExcelSheets(
  data: ArrayBuffer | Uint8Array,
  { dateOnly = false, trimCells = false }: ExcelReadOptions = {},
): Promise<SpreadsheetSheet[]> {
  const { default: Excel } = await import('exceljs');
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data,
  );
  return workbook.worksheets.map(sheet => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        while (values.length < column - 1) values.push('');
        const text = excelCellText(cell.value, dateOnly);
        values.push(trimCells ? text.trim() : text);
      });
      if (values.some(value => value.trim() !== '')) rows.push(values);
    });
    return { name: sheet.name, rows };
  });
}
