/**
 * مساعدات اختبار لبناء ملفات xlsx عبر exceljs (بدل مكتبة xlsx القديمة).
 */
import ExcelJS from 'exceljs';

export interface SheetSpec {
  name: string;
  rows: (string | number | boolean | null)[][];
}

/** يبني مصفوفة بايتات ملف xlsx من صفوف (AOA). */
export async function buildXlsxBuffer(sheets: SheetSpec[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const row of s.rows) {
      ws.addRow(row.map(c => (c === null ? '' : c)));
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/** يبني ملف xlsx ككائن File (لمحاكاة رفع ملف). */
export async function makeXlsxFile(
  sheets: SheetSpec[],
  name = 'sheet.xlsx'
): Promise<File> {
  const bytes = await buildXlsxBuffer(sheets);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([ab], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
