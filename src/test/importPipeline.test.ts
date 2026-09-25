import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { excelCellText, readExcelSheets } from '../data/files/excel';
import { parseSheetRows } from '../domain/imports/matrixParser';
import { normalizePhone } from '../domain/imports/normalization';
import { parseAnyTable, parseSheetBuffer, rowsFromExcel } from '../services/imports/readFiles';

async function workbook() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Synthetic teacher');
  sheet.addRow(['Math الخميس من 4/5', '', 'English الجمعة من 5/6']);
  sheet.addRow(['Synthetic student A', '', 'Synthetic student B']);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe('shared spreadsheet adapter and pure parsers', () => {
  it('preserves the matrix timestamp vs flat-table date distinction', () => {
    const date = new Date('2026-09-24T12:00:00Z');
    expect(excelCellText(date)).toBe('2026-09-24T12:00:00.000Z');
    expect(excelCellText(date, true)).toBe('2026-09-24');
  });
  it('handles numbers, empty cells, hyperlinks, rich text and formula results consistently', () => {
    expect(excelCellText(0)).toBe('0');
    expect(excelCellText(false)).toBe('false');
    expect(excelCellText(null)).toBe('');
    expect(excelCellText({ text: 'Label', hyperlink: 'https://example.test' })).toBe('Label');
    expect(excelCellText({ richText: [{ text: 'One' }, { text: 'Two' }] })).toBe('OneTwo');
    expect(excelCellText({ formula: '1+2', result: 3 })).toBe('3');
  });
  it('respects Uint8Array offsets and preserves sparse columns', async () => {
    const bytes = await workbook();
    const padded = new Uint8Array(bytes.length + 20);
    padded.set(bytes, 7);
    const view = padded.subarray(7, 7 + bytes.length);
    const sheets = await readExcelSheets(view);
    expect(sheets[0].rows[1]).toEqual(['Synthetic student A', '', 'Synthetic student B']);
    expect(await parseSheetBuffer(view)).toEqual(parseSheetRows(sheets));
  });
  it('finds flat-table headers below a title row and combines valid worksheets', async () => {
    const book = new ExcelJS.Workbook();
    for (const name of ['First', 'Second']) {
      const sheet = book.addWorksheet(name);
      sheet.addRow(['Synthetic title']);
      sheet.addRow(['Student Name', 'Teacher', 'Subject', 'Price']);
      sheet.addRow([`Synthetic ${name}`, 'Synthetic teacher', 'math', 200]);
    }
    const buffer = new Uint8Array(await book.xlsx.writeBuffer()).buffer as ArrayBuffer;
    const sheets = await rowsFromExcel(buffer);
    expect(sheets.map(s => s.headers[0])).toEqual(['Student Name', 'Student Name']);
    const parsed = await parseAnyTable({ name: 'synthetic.xlsx', buffer });
    expect(parsed.records).toHaveLength(2);
    expect(parsed.uniqueStudents).toBe(2);
  });
  it('keeps CSV/JSON handling independent of Excel and database access', async () => {
    const text = 'student,teacher,subject,price\nSynthetic Student,Synthetic Teacher,math,200';
    const parsed = await parseAnyTable({ name: 'synthetic.csv', buffer: new ArrayBuffer(0), text });
    expect(parsed.records[0]).toMatchObject({ studentName: 'Synthetic Student', price: 200 });
    await expect(
      parseAnyTable({ name: 'broken.json', buffer: new ArrayBuffer(0), text: '{invalid' }),
    ).rejects.toThrow();
  });
  it('shares the historic phone canonicalization without changing its accepted forms', () => {
    expect(normalizePhone('010-0000-0000')).toBe('01000000000');
    expect(normalizePhone('+201000000000')).toBe('01000000000');
    expect(normalizePhone('1000000000')).toBe('01000000000');
  });
});
