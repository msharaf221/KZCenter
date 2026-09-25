import { matchSubject, normalizeSubjectText } from '../../lib/subjects';
import { parseDays, parseTimeRange } from './matrixHeaders';
import { extractPhone, foldArabic, normalize } from './normalization';
import { detectField, looksLikeTable, mapHeaders } from './tableHeaders';
import type { FieldKey, TableParseResult, TableRecord } from './types';

/** قراءة رقم من خلية (بيشيل العملة والفواصل: «250 ج.م» → 250) */
export function parseNumber(value: unknown): number | undefined {
  const text = normalize(value).replace(/[،,]/g, '');
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/** قراءة النوع من نص («ولد/بنت/ذكر/انثى/male/female») */
export function parseGender(value: unknown): 'male' | 'female' | undefined {
  const v = normalizeSubjectText(value);
  if (!v) return undefined;
  if (/(بنت|انثي|انثه|بنات|female|girl|f)$/.test(v) || ['بنت', 'انثي', 'female', 'f', 'girl'].includes(v))
    return 'female';
  if (['ولد', 'ذكر', 'male', 'm', 'boy', 'اولاد'].includes(v)) return 'male';
  return undefined;
}

/** تحويل صف خام لسجل، أو null لو الصف فاضي/مش صالح */
export function parseRow(row: string[], map: Partial<Record<FieldKey, number>>, rowNumber: number): TableRecord | null {
  const get = (field: FieldKey): string => {
    const index = map[field];
    return index === undefined ? '' : normalize(row[index]);
  };

  const rawStudent = get('studentName');
  if (!rawStudent) return null;

  // الاسم والتليفون ممكن يكونوا في نفس الخلية («أحمد محمد 01012345678»)
  const { name, phone: inlinePhone } = extractPhone(rawStudent);
  if (!name) return null;

  const groupName = get('groupName');
  const courseName = get('courseName');
  const subjectCell = get('subject');
  const teacherName = get('teacherName');

  // المادة: عمود المادة الأول، وبعدين اسم المجموعة، وبعدين الكورس، وأخيراً المدرس
  const subject =
    matchSubject(subjectCell) ?? matchSubject(groupName) ?? matchSubject(courseName) ?? matchSubject(teacherName);

  // الميعاد ممكن يبقى في عمود مستقل أو جوه اسم المجموعة
  const dayText = [get('day'), groupName].filter(Boolean).join(' ');
  const timeText = [get('time'), groupName].filter(Boolean).join(' ');
  const days = parseDays(dayText);
  const time = parseTimeRange(timeText);

  const priceCell = parseNumber(get('price'));

  return {
    studentName: name,
    studentPhone: inlinePhone || normalize(get('studentPhone')) || undefined,
    parentPhone: normalize(get('parentPhone')) || undefined,
    age: parseNumber(get('age')),
    gender: parseGender(get('gender')),
    teacherName: teacherName || undefined,
    teacherPhone: normalize(get('teacherPhone')) || undefined,
    groupName: groupName || undefined,
    courseName: courseName || undefined,
    subject,
    price: priceCell !== undefined && priceCell >= 0 ? priceCell : undefined,
    days: days.keys,
    dayLabels: days.labels,
    startTime: time?.start,
    endTime: time?.end,
    timeLabel: time?.label,
    room: normalize(get('room')) || undefined,
    maxStudents: parseNumber(get('maxStudents')),
    notes: normalize(get('notes')) || undefined,
    rowNumber,
  };
}

// ==================== JSON ====================

/**
 * قراءة JSON: مصفوفة كائنات (`[{...}, {...}]`) أو كائن فيه مصفوفة
 * (`{ students: [...] }` / `{ data: [...] }` / `{ rows: [...] }`).
 * مفاتيح الكائنات بتتعامل زي عناوين الأعمدة بالظبط.
 */
export function rowsFromJson(input: unknown): { headers: string[]; rows: string[][] } {
  let list: unknown = input;

  if (list && typeof list === 'object' && !Array.isArray(list)) {
    const obj = list as Record<string, unknown>;
    const arrayKey = ['students', 'data', 'rows', 'records', 'items', 'الطلاب', 'البيانات'].find(k =>
      Array.isArray(obj[k]),
    );
    list = arrayKey ? obj[arrayKey] : Object.values(obj).find(v => Array.isArray(v));
  }

  if (!Array.isArray(list) || list.length === 0) return { headers: [], rows: [] };

  // كل المفاتيح الموجودة في أي عنصر (العناصر مش لازم تبقى متطابقة)
  const headers: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }

  const rows = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item =>
      headers.map(h => {
        const v = item[h];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      }),
    );

  return { headers, rows };
}

// ==================== CSV ====================

/** قراءة CSV (بيدعم الفاصلة والمنقوطة والتاب + علامات التنصيص) */
export function rowsFromCsv(text: string): { headers: string[]; rows: string[][] } {
  const content = text.replace(/^\uFEFF/, '');
  const firstLine = content.split(/\r?\n/).find(l => l.trim()) || '';
  const delimiter = [';', '\t', ',']
    .map(d => ({ d, count: firstLine.split(d).length }))
    .sort((a, b) => b.count - a.count)[0].d;

  const all: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.some(c => c !== '')) all.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cell += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      pushCell();
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      pushRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) pushRow();

  if (all.length === 0) return { headers: [], rows: [] };
  return { headers: all[0], rows: all.slice(1) };
}

/** تجميع نتيجة القراءة من صفوف خام */
export function parseTable(headers: string[], rows: string[][], startRowNumber = 2): TableParseResult {
  const map = mapHeaders(headers);
  const detectedFields = Object.keys(map) as FieldKey[];
  const unknownHeaders = headers.filter(h => normalize(h) && !detectField(h));

  const records: TableRecord[] = [];
  let skippedRows = 0;

  rows.forEach((row, i) => {
    const record = parseRow(row, map, startRowNumber + i);
    if (record) records.push(record);
    else skippedRows++;
  });

  const warnings: string[] = [];
  if (map.teacherName === undefined) {
    warnings.push('مفيش عمود للمدرس — المجموعات هتتربط بمدرس «غير محدد» تقدر تغيّره بعدين');
  }
  if (map.groupName === undefined && map.subject === undefined) {
    warnings.push('مفيش عمود للمجموعة ولا للمادة — هيتم تجميع الطلاب حسب المدرس');
  }
  const withoutSubject = records.filter(r => !r.subject).length;
  if (withoutSubject > 0) {
    warnings.push(`${withoutSubject} صف مش واضح مادته — هياخد السعر الافتراضي وتقدر تربطه بعدين`);
  }

  const uniqueStudents = new Set(records.map(r => foldArabic(r.studentName.toLowerCase()))).size;

  return {
    records,
    detectedFields,
    unknownHeaders,
    teachers: [...new Set(records.map(r => r.teacherName).filter((t): t is string => !!t))],
    groups: [...new Set(records.map(r => r.groupName).filter((g): g is string => !!g))],
    subjects: [...new Set(records.map(r => r.subject?.name).filter((s): s is string => !!s))],
    uniqueStudents,
    skippedRows,
    warnings,
    looksLikeTable: looksLikeTable(headers) && records.length > 0,
  };
}
