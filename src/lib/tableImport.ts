/**
 * استيراد داتا جدولية (صف لكل سجل) — Excel / CSV / JSON
 * =========================================================
 *
 * شيت المركز القديم شكله «مصفوفة»: كل تبويب = مدرس، وكل عمود = مجموعة، وتحته
 * أسماء الطلاب (بيتقرا في `sheetImport.ts`). لكن الداتا اللي بتتصدّر من أنظمة
 * تانية أو اللي بتتكتب بالإيد عادةً بتبقى **جدول عادي**: صف لكل طالب وفيه
 * أعمدة للمدرس والمجموعة والمادة والسعر…
 *
 * الملف ده بيقرا الشكل ده بمرونة:
 *  - أسماء الأعمدة بتتعرف بالعربي والإنجليزي وبأي كتابة (مدرس/المدرس/teacher/instructor…)
 *  - الأعمدة الناقصة مش بتكسر الاستيراد: المادة بتتعرف من اسم المجموعة/الكورس،
 *    والسعر من كاتالوج المواد، والمجموعة بتتولّد من (مدرس + مادة + ميعاد).
 *  - الربط كامل: طالب ← مجموعة ← مدرس + كورس ← مادة ← سعر.
 *
 * الجزء الأول دوال نقية (parsing) قابلة للاختبار من غير قاعدة بيانات.
 */
import type * as ExcelJS from 'exceljs';
import {
  matchSubject, normalizeSubjectText,
  type Subject,
} from './subjects';
import {
  extractPhone, foldArabic, parseDays, parseTimeRange,
} from './sheetImport';

// ==================== COLUMN DETECTION ====================

/** الحقول اللي بنعرف نقراها من الجدول */
export type FieldKey =
  | 'studentName' | 'studentPhone' | 'parentPhone' | 'age' | 'gender'
  | 'teacherName' | 'teacherPhone'
  | 'groupName' | 'courseName' | 'subject'
  | 'price' | 'day' | 'time' | 'room' | 'maxStudents' | 'notes';

/**
 * أسماء الأعمدة المقبولة لكل حقل.
 * المطابقة بتتم على النص الموحّد (من غير همزات/تشكيل/رموز)، وبتفضّل
 * المطابقة الكاملة على الجزئية عشان «اسم المدرس» ما تتقراش «اسم الطالب».
 */
const FIELD_ALIASES: Record<FieldKey, string[]> = {
  studentName: [
    'اسم الطالب', 'الطالب', 'اسم الطالبة', 'الطالبة', 'اسم التلميذ', 'التلميذ',
    'الاسم', 'اسم', 'student', 'student name', 'name', 'pupil',
  ],
  studentPhone: [
    'تليفون الطالب', 'موبايل الطالب', 'رقم الطالب', 'تليفون', 'موبايل', 'الهاتف',
    'رقم التليفون', 'التليفون', 'phone', 'mobile', 'student phone', 'contact',
  ],
  parentPhone: [
    'تليفون ولي الامر', 'رقم ولي الامر', 'موبايل ولي الامر', 'ولي الامر',
    'تليفون الاب', 'تليفون الام', 'parent phone', 'guardian phone', 'parent',
  ],
  age: ['السن', 'العمر', 'سن', 'age'],
  gender: ['النوع', 'الجنس', 'gender', 'sex'],
  teacherName: [
    'اسم المدرس', 'المدرس', 'مدرس', 'المدرسة', 'اسم المعلم', 'المعلم', 'معلم',
    'teacher', 'teacher name', 'instructor', 'tutor',
  ],
  teacherPhone: ['تليفون المدرس', 'رقم المدرس', 'موبايل المدرس', 'teacher phone'],
  groupName: [
    'اسم المجموعة', 'المجموعة', 'مجموعة', 'المجموعه', 'الجروب', 'جروب',
    'group', 'group name', 'class', 'section',
  ],
  courseName: ['اسم الكورس', 'الكورس', 'كورس', 'course', 'course name', 'program'],
  subject: [
    'المادة', 'مادة', 'الماده', 'ماده', 'التخصص', 'المنهج',
    'subject', 'material', 'specialization',
  ],
  price: [
    'السعر', 'سعر', 'الاشتراك', 'اشتراك', 'المبلغ', 'مبلغ', 'الرسوم', 'رسوم',
    'سعر الشهر', 'السعر الشهري', 'price', 'fee', 'fees', 'amount', 'monthly',
  ],
  day: ['اليوم', 'الايام', 'يوم', 'ايام', 'day', 'days', 'schedule'],
  time: ['الميعاد', 'الوقت', 'الساعة', 'ميعاد', 'time', 'hour', 'from to'],
  room: ['القاعة', 'قاعة', 'الغرفة', 'room', 'hall', 'class room'],
  maxStudents: ['السعة', 'الحد الاقصى', 'اقصى عدد', 'capacity', 'max', 'max students'],
  notes: ['ملاحظات', 'ملحوظات', 'note', 'notes', 'comment', 'remarks'],
};

/** فهرس المطابقة: النص الموحّد ← الحقل (مرتّب بالأطول عشان الأدق يكسب) */
const ALIAS_TO_FIELD: { alias: string; field: FieldKey }[] = Object.entries(FIELD_ALIASES)
  .flatMap(([field, aliases]) =>
    aliases.map(alias => ({ alias: normalizeSubjectText(alias), field: field as FieldKey }))
  )
  .filter(x => x.alias.length > 0)
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * تحديد الحقل اللي يقابل عنوان عمود.
 * المطابقة الكاملة الأول، وبعدين «العنوان بيبدأ بالـ alias» (مثال: «تليفون الطالب 1»)،
 * وأخيراً الاحتواء الكامل ككلمات.
 */
export function detectField(header: string): FieldKey | null {
  const h = normalizeSubjectText(header);
  if (!h) return null;

  for (const { alias, field } of ALIAS_TO_FIELD) {
    if (h === alias) return field;
  }
  for (const { alias, field } of ALIAS_TO_FIELD) {
    if (h.startsWith(`${alias} `) || h.endsWith(` ${alias}`)) return field;
  }
  for (const { alias, field } of ALIAS_TO_FIELD) {
    const words = h.split(' ');
    const parts = alias.split(' ');
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, j) => words[i + j] === p)) return field;
    }
  }
  return null;
}

/**
 * خريطة أعمدة صف العناوين → الحقول.
 * أول عمود بيتطابق مع حقل هو اللي بيكسب (الأعمدة المكررة بتتجاهل).
 */
export function mapHeaders(headers: string[]): Partial<Record<FieldKey, number>> {
  const map: Partial<Record<FieldKey, number>> = {};
  headers.forEach((h, index) => {
    const field = detectField(h);
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

/**
 * هل الجدول ده «صف لكل سجل»؟
 * الشرط: فيه عمود اسم طالب + على الأقل عمود ربط واحد (مدرس/مجموعة/مادة/كورس).
 */
export function looksLikeTable(headers: string[]): boolean {
  const map = mapHeaders(headers);
  if (map.studentName === undefined) return false;
  return ['teacherName', 'groupName', 'subject', 'courseName']
    .some(k => map[k as FieldKey] !== undefined);
}

// ==================== ROW PARSING ====================

/** سجل واحد بعد القراءة والتنظيف */
export interface TableRecord {
  studentName: string;
  studentPhone?: string;
  parentPhone?: string;
  age?: number;
  gender?: 'male' | 'female';
  teacherName?: string;
  teacherPhone?: string;
  groupName?: string;
  courseName?: string;
  /** المادة اللي اتعرفت (من عمود المادة أو من أسماء المجموعة/الكورس) */
  subject: Subject | null;
  /** السعر المكتوب صراحةً في الصف (بيتقدّم على سعر المادة) */
  price?: number;
  days: string[];
  dayLabels: string[];
  startTime?: string;
  endTime?: string;
  timeLabel?: string;
  room?: string;
  maxStudents?: number;
  notes?: string;
  /** رقم الصف في الملف (للتقارير والأخطاء) */
  rowNumber: number;
}

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/** قراءة رقم من خلية (بيشيل العملة والفواصل: «250 ج.م» → 250) */
export function parseNumber(value: unknown): number | undefined {
  const text = clean(value).replace(/[،,]/g, '');
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}

/** قراءة النوع من نص («ولد/بنت/ذكر/انثى/male/female») */
export function parseGender(value: unknown): 'male' | 'female' | undefined {
  const v = normalizeSubjectText(value);
  if (!v) return undefined;
  if (/(بنت|انثي|انثه|بنات|female|girl|f)$/.test(v) || ['بنت', 'انثي', 'female', 'f', 'girl'].includes(v)) return 'female';
  if (['ولد', 'ذكر', 'male', 'm', 'boy', 'اولاد'].includes(v)) return 'male';
  return undefined;
}

/** تحويل صف خام لسجل، أو null لو الصف فاضي/مش صالح */
export function parseRow(
  row: string[],
  map: Partial<Record<FieldKey, number>>,
  rowNumber: number,
): TableRecord | null {
  const get = (field: FieldKey): string => {
    const index = map[field];
    return index === undefined ? '' : clean(row[index]);
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
  const subject = matchSubject(subjectCell)
    ?? matchSubject(groupName)
    ?? matchSubject(courseName)
    ?? matchSubject(teacherName);

  // الميعاد ممكن يبقى في عمود مستقل أو جوه اسم المجموعة
  const dayText = [get('day'), groupName].filter(Boolean).join(' ');
  const timeText = [get('time'), groupName].filter(Boolean).join(' ');
  const days = parseDays(dayText);
  const time = parseTimeRange(timeText);

  const priceCell = parseNumber(get('price'));

  return {
    studentName: name,
    studentPhone: inlinePhone || clean(get('studentPhone')) || undefined,
    parentPhone: clean(get('parentPhone')) || undefined,
    age: parseNumber(get('age')),
    gender: parseGender(get('gender')),
    teacherName: teacherName || undefined,
    teacherPhone: clean(get('teacherPhone')) || undefined,
    groupName: groupName || undefined,
    courseName: courseName || undefined,
    subject,
    price: priceCell !== undefined && priceCell >= 0 ? priceCell : undefined,
    days: days.keys,
    dayLabels: days.labels,
    startTime: time?.start,
    endTime: time?.end,
    timeLabel: time?.label,
    room: clean(get('room')) || undefined,
    maxStudents: parseNumber(get('maxStudents')),
    notes: clean(get('notes')) || undefined,
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
    const arrayKey = ['students', 'data', 'rows', 'records', 'items', 'الطلاب', 'البيانات']
      .find(k => Array.isArray(obj[k]));
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
    .map(item => headers.map(h => {
      const v = item[h];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    }));

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

  const pushCell = () => { row.push(cell.trim()); cell = ''; };
  const pushRow = () => {
    pushCell();
    if (row.some(c => c !== '')) all.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
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

// ==================== EXCEL ====================

/** يحوّل قيمة خلية exceljs لنص (نفس منطق sheetImport) */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText: { text?: string }[] }).richText.map(t => t.text ?? '').join('');
  }
  if (typeof value === 'object' && 'text' in value && typeof (value as { text?: unknown }).text === 'string') {
    return (value as { text: string }).text;
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText((value as { result: ExcelJS.CellValue }).result);
  }
  return String(value);
}

/**
 * قراءة كل تبويبات ملف Excel كجداول.
 * بيدوّر على صف العناوين في أول ٥ صفوف (الشيتات بتبدأ بعنوان/لوجو أحياناً).
 */
export async function rowsFromExcel(
  data: ArrayBuffer | Uint8Array
): Promise<{ headers: string[]; rows: string[][]; sheetName: string }[]> {
  const ExcelJSLib = (await import('exceljs')) as unknown as { default: typeof ExcelJS };
  const wb = new ExcelJSLib.default.Workbook();
  await wb.xlsx.load(
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data,
  );

  const sheets: { headers: string[]; rows: string[][]; sheetName: string }[] = [];

  for (const ws of wb.worksheets) {
    const aoa: string[][] = [];
    ws.eachRow({ includeEmpty: false }, row => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (values.length < colNumber - 1) values.push('');
        values.push(cellText(cell.value).trim());
      });
      if (values.some(v => v !== '')) aoa.push(values);
    });
    if (aoa.length < 2) continue;

    // صف العناوين = أول صف في أول ٥ صفوف يبان إنه جدول سجلات
    let headerIndex = aoa.findIndex((r, i) => i < 5 && looksLikeTable(r));
    if (headerIndex === -1) headerIndex = 0;

    sheets.push({
      sheetName: clean(ws.name),
      headers: aoa[headerIndex],
      rows: aoa.slice(headerIndex + 1),
    });
  }

  return sheets;
}

// ==================== PARSE RESULT ====================

export interface TableParseResult {
  records: TableRecord[];
  /** الحقول اللي اتعرفت في الملف */
  detectedFields: FieldKey[];
  /** عناوين أعمدة مش معروفة (بتتجاهل) */
  unknownHeaders: string[];
  teachers: string[];
  groups: string[];
  subjects: string[];
  uniqueStudents: number;
  /** صفوف اتخطّت (فاضية أو من غير اسم طالب) */
  skippedRows: number;
  warnings: string[];
  /** هل الملف شكله جدول سجلات فعلاً؟ */
  looksLikeTable: boolean;
}

/** تجميع نتيجة القراءة من صفوف خام */
export function parseTable(
  headers: string[],
  rows: string[][],
  startRowNumber = 2,
): TableParseResult {
  const map = mapHeaders(headers);
  const detectedFields = Object.keys(map) as FieldKey[];
  const unknownHeaders = headers.filter(h => clean(h) && !detectField(h));

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

  const uniqueStudents = new Set(
    records.map(r => foldArabic(r.studentName.toLowerCase()))
  ).size;

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

/**
 * قراءة ملف بأي صيغة (xlsx / csv / json) وإرجاع أفضل نتيجة.
 * لو الملف Excel بأكتر من تبويب، بنجمّع كل التبويبات اللي شكلها جداول سجلات.
 */
export async function parseAnyTable(
  file: { name: string; buffer: ArrayBuffer; text?: string }
): Promise<TableParseResult> {
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
    return parsedSheets[0] ?? {
      records: [], detectedFields: [], unknownHeaders: [], teachers: [], groups: [],
      subjects: [], uniqueStudents: 0, skippedRows: 0,
      warnings: ['الملف مش شكله جدول سجلات'], looksLikeTable: false,
    };
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
  merged.uniqueStudents = new Set(
    merged.records.map(r => foldArabic(r.studentName.toLowerCase()))
  ).size;

  return merged;
}
