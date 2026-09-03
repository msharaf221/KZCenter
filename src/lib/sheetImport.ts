/**
 * استيراد شيت إكسيل المركز (Kids Zone)
 *
 * شكل الشيت:
 *  - كل شيت = مدرس (اسم المدرس هو اسم التبويب)
 *  - الصف الأول = عناوين المجموعات: «اسم المجموعة + اليوم + من X/Y»
 *  - باقي الصفوف تحت كل عمود = أسماء طلاب المجموعة
 *
 * الجزء الأول دوال نقية (parsing) قابلة للاختبار من غير قاعدة بيانات،
 * والجزء التاني `importSheetIntoDb` هو اللي بيكتب فعلاً.
 */
import * as XLSX from 'xlsx';
import {
  dbAdd, dbGetAll, dbGetById, enrollStudent, generateId,
  Course, Gender, Group, Student, Teacher, ScheduleItem,
} from './db';

/** طريقة تحويل المجموعات لكورسات */
export type CourseStrategy = 'single' | 'byType' | 'byTeacher';

export interface ParsedGroup {
  /** اسم المدرس (اسم التبويب) */
  teacherName: string;
  /** العنوان الخام من الشيت */
  rawHeader: string;
  /** اسم المجموعة بعد تنظيف اليوم والميعاد */
  name: string;
  /** مفاتيح الأيام بصيغة التطبيق */
  days: string[];
  /** أسماء الأيام بالعربي للعرض */
  dayLabels: string[];
  startTime: string;
  endTime: string;
  /** نص الميعاد الخام (مثال: "4/5") للعرض */
  timeLabel: string;
  students: string[];
}

export interface SheetParseResult {
  /** أسماء المدرسين (الشيتات اللي فيها طلاب فعلاً) */
  teachers: string[];
  groups: ParsedGroup[];
  /** الأسماء الفريدة بعد إزالة التكرار */
  uniqueStudents: string[];
  /** عدد الخانات (اسم × مجموعة) قبل إزالة التكرار */
  totalSlots: number;
  /** طلاب مسجلين في أكتر من مجموعة */
  multiGroupStudents: number;
  /** عدد الأعمدة اللي اتخطّت (فاضية أو placeholders) */
  skippedColumns: number;
  /**
   * هل الشيت شكله شيت المركز فعلاً؟ (على الأقل مجموعة واحدة فيها يوم أو ميعاد)
   * عشان نمنع استيراد ملف إكسيل عشوائي بالغلط.
   */
  looksLikeCenterSheet: boolean;
  warnings: string[];
}

// ==================== NORMALIZATION ====================

const normalize = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

const ARABIC_REPLACEMENTS: [RegExp, string][] = [
  [/[أإآٱ]/g, 'ا'],
  [/ى/g, 'ي'],
  [/ؤ/g, 'و'],
  [/ئ/g, 'ي'],
  [/ة/g, 'ه'],
];

/** توحيد الألف عشان الأخطاء الإملائية والهمزات في الشيت */
export function foldArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0640]/g, '')            // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه');
}

/**
 * نفس التوحيد بس مع خريطة من كل حرف في الناتج لمكانه في النص الأصلي،
 * عشان نقدر نقصّ من النص الأصلي (مش من الموحّد) ونحافظ على كتابته.
 */
function foldWithMap(input: string): { folded: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (/[\u064B-\u0652\u0640]/.test(ch)) continue;
    let out = ch;
    for (const [re, rep] of ARABIC_REPLACEMENTS) {
      if (re.test(ch)) { out = rep; break; }
    }
    chars.push(out);
    map.push(i);
  }
  return { folded: chars.join(''), map };
}

// ==================== DAYS ====================

const DAY_PATTERNS: { key: string; label: string; patterns: string[] }[] = [
  { key: 'saturday', label: 'السبت', patterns: ['السبت', 'السيت', 'السب'] },
  { key: 'sunday', label: 'الاحد', patterns: ['الاحد', 'الأحد'] },
  { key: 'monday', label: 'الاثنين', patterns: ['الاثنين', 'الإثنين', 'الاتنين'] },
  { key: 'tuesday', label: 'الثلاثاء', patterns: ['الثلاثاء', 'الثلاث', 'التلات'] },
  { key: 'wednesday', label: 'الاربعاء', patterns: ['الاربعاء', 'الأربعاء', 'الاربعا'] },
  { key: 'thursday', label: 'الخميس', patterns: ['الخميس'] },
  { key: 'friday', label: 'الجمعة', patterns: ['الجمعه', 'الجمعة'] },
];

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** استخراج الأيام من نص العنوان (بيدعم «السبت والثلاث» و«الاثنين والخميس») */
export function parseDays(text: string): { keys: string[]; labels: string[] } {
  const folded = foldArabic(normalize(text));
  const keys: string[] = [];

  for (const d of DAY_PATTERNS) {
    if (d.patterns.some(p => folded.includes(foldArabic(p))) && !keys.includes(d.key)) {
      keys.push(d.key);
    }
  }

  keys.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  return { keys, labels: keys.map(k => DAY_PATTERNS.find(d => d.key === k)!.label) };
}

// ==================== TIME ====================

/** ساعات المراكز كلها مسائية (4 لـ 8) */
function to24(hour: number): number {
  return hour >= 12 ? hour : hour + 12;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * الميعاد بيكتب بشرطة مائلة بس: «4/5» = من 4 لـ 5.
 * (لو استخدمنا «-» كمان هيقرا «s.r 2 -3» كأنه ميعاد، فممنوع.)
 */
const TIME_RE = /(\d{1,2})\s*[/\\]\s*(\d{1,2})/;

export interface TimeRange {
  start: string;
  end: string;
  label: string;
}

/** استخراج الفترة من «من 4/5». بيرجع null لو مفيش ميعاد في العنوان. */
export function parseTimeRange(text: string): TimeRange | null {
  const m = normalize(text).match(TIME_RE);
  if (!m) return null;
  const from = parseInt(m[1], 10);
  const to = parseInt(m[2], 10);
  if (from < 1 || from > 12 || to < 1 || to > 12 || to <= from) return null;

  return {
    start: `${pad(to24(from))}:00`,
    end: `${pad(to24(to))}:00`,
    label: `${from}/${to}`,
  };
}

// ==================== GROUP NAME ====================

/**
 * اسم المجموعة = العنوان بعد شيل الأيام والفترة وكلمة «من».
 * - لو فضل فاضي (مثال: «الاحد من 5/6») → «اسم المدرس - اليوم الميعاد»
 * - لو الاسم من غير رقم (مثال: «s.r» أو «حساب») → نضيف الميعاد عشان ما يتكررش
 */
export function extractGroupName(opts: {
  rawHeader: string;
  teacherName: string;
  days: { keys: string[]; labels: string[] };
  time: TimeRange | null;
}): string {
  const original = normalize(opts.rawHeader);
  const { folded, map } = foldWithMap(original);
  const cut = new Array<boolean>(original.length).fill(false);

  const markRange = (foldedIndex: number, foldedLength: number) => {
    const start = map[foldedIndex];
    const end = map[foldedIndex + foldedLength - 1] + 1;
    for (let i = start; i < end; i++) cut[i] = true;
  };

  // 1) الأيام — لازم يكون قبلها بداية أو مسافة، بس مش لازم بعدها
  //    (عشان نقدر نقرا «الاحدمن 5/6» اللي مكتوبة من غير مسافة)
  const isLetter = (ch?: string) => !!ch && /[\u0621-\u064Aa-zA-Z]/.test(ch);
  for (const d of DAY_PATTERNS) {
    for (const p of d.patterns) {
      const fp = foldArabic(p);
      let idx = folded.indexOf(fp);
      while (idx !== -1) {
        // نتخطى «و» الربط: «والخميس» = «و» + «الخميس»
        let left = idx - 1;
        while (left >= 0 && folded[left] === 'و') left--;
        if (!isLetter(folded[left])) markRange(left + 1, idx + fp.length - (left + 1));
        idx = folded.indexOf(fp, idx + fp.length);
      }
    }
  }

  // 2) الميعاد (نفس الـ regex اللي استخدمه parseTimeRange)
  const tm = folded.match(TIME_RE);
  if (tm && tm.index !== undefined) markRange(tm.index, tm[0].length);

  // 3) الكلمات المتبقية من العنوان («من» و«و» الربط) بتتشال على مستوى الكلمة
  //    بعد ما الأيام والميعاد اتشالوا — عشان «مناهج» ما تتقصّش لـ «اهج»
  const kept = original.split('').filter((_, i) => !cut[i]).join('');
  const DROP_WORDS = new Set(['من', 'و']);
  const name = normalize(kept)
    .split(' ')
    .filter(w => w && !DROP_WORDS.has(foldArabic(w)))
    .join(' ')
    .replace(/^[-–—/\s]+|[-–—/\s]+$/g, '')
    .replace(/\s+/g, ' ');

  const fallback = [
    opts.teacherName,
    [opts.days.labels.join(' و '), opts.time?.label].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' - ');

  if (!name) return fallback;
  if (!/\d/.test(name) && opts.time?.label) return `${name} ${opts.time.label}`;
  return name;
}

/**
 * فضّ الاشتباك لو مدرس عنده مجموعتين بنفس الاسم بعد التنظيف
 * (مثال: «level 3 السبت من 4/5» و«level 3 السبت من5/6» عند ايمان عبدالرحيم).
 */
function disambiguateGroups(groups: ParsedGroup[]): void {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const k = `${g.teacherName}::${g.name}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const g of groups) {
    if ((counts.get(`${g.teacherName}::${g.name}`) || 0) > 1) {
      const extra = [g.dayLabels.join(' و '), g.timeLabel].filter(Boolean).join(' ');
      if (extra) g.name = `${g.name} (${extra})`;
    }
  }
}

// ==================== PLACEHOLDERS ====================

/** أعمدة فاضية أو placeholders («عمود5»، «Column3»، «gr 8») */
export function isPlaceholderHeader(header: string): boolean {
  const h = normalize(header);
  if (!h) return true;
  if (/^عمود\s*\d+$/i.test(h)) return true;
  if (/^column\s*\d+$/i.test(h)) return true;
  if (/^gr\s*\d+$/i.test(h)) return true;
  return false;
}

// ==================== GENDER GUESS ====================

/**
 * تخمين النوع من الاسم الأول — تقريبي، والمستخدم هيراجعه.
 * أي اسم مش في القائمة بيتحسب «ولد».
 */
const FEMALE_FIRST_NAMES = new Set(
  `فاطمه مريم عائشه زينب ساره نورهان مني هدي امنيه رقيه جودي جود ليلي ليان لين لمار لينا لوتس
   مكه كارما كارلا كارن كارين كنده تاليا تالين تيا فريده سدره سلمي سمر سجي سجى شروق شيماء يارا
   جنه حور داليدا روفان روفيده ريم زينه ملك منار مناره ميار ندي نوال نور نوران هاجر وتين ايسل
   اسيل سيليا بسملة تمارا ايلن ايه اسماء افنان ايمان انجي تسنيم تقى حبيبه خديجه داليا دانه رنا
   رحاب زهراء سما سهيله صفا عهد غاده ماهيتاب منه مها مي نجوي نهى هبه هند ولاء ياسمين يمنى
   روان رزان ريتال ريتاج مليكه رودينا ساندي نرمين اروى جنى هنا شهد لي لي تالا لمى سلسبيل ميس
   جويريه خديجة فاطمة سارة هدى رقية مكة فريدة سدرة سلمى زينة منارة ندى نوال نوران آية أسماء
   أفنان إيمان إنجي حبيبة دانا سهيلة غادة منة نجوى هبة أروى جنى تالا`
    .split(/\s+/)
    .filter(Boolean)
    .map(foldArabic)
);

export function guessGender(fullName: string): Gender {
  const first = foldArabic(normalize(fullName).split(' ')[0] || '');
  return FEMALE_FIRST_NAMES.has(first) ? 'female' : 'male';
}

// ==================== COURSE FAMILY ====================

/**
 * «عائلة» المجموعة = اسم المجموعة من غير الأرقام/الميعاد،
 * وتُستخدم لو استراتيجية الكورسات «كورس لكل نوع مجموعة».
 */
export function courseFamily(group: Pick<ParsedGroup, 'name' | 'teacherName'>): string {
  if (group.name.includes(group.teacherName)) return group.teacherName;
  const cleaned = normalize(
    group.name
      .replace(/\([^)]*\)/g, ' ')          // «level 3 (السبت 4/5)» → «level 3»
      .replace(/\d+(\s*\/\s*\d+)?/g, ' ')
  )
    .replace(/^[-–—/\s]+|[-–—/\s]+$/g, '')
    .replace(/\s+/g, ' ');
  return cleaned || group.teacherName;
}

// ==================== PARSER ====================

export function parseSheetBuffer(data: ArrayBuffer | Uint8Array): SheetParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  const warnings: string[] = [];
  const groups: ParsedGroup[] = [];
  const teachers: string[] = [];
  const seenStudents = new Map<string, number>();
  let totalSlots = 0;
  let skippedColumns = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) { skippedColumns++; continue; }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1, raw: false, defval: '', blankrows: false,
    });
    if (rows.length === 0) { skippedColumns++; continue; }

    const teacherName = normalize(sheetName);
    const header = (rows[0] || []).map(normalize);
    let teacherHasStudents = false;

    for (let c = 0; c < header.length; c++) {
      const students: string[] = [];
      for (let r = 1; r < rows.length; r++) {
        const v = normalize((rows[r] || [])[c]);
        if (v) students.push(v);
      }

      // عمود من غير طلاب = placeholder أو مجموعة لسه فاضية → نتخطاه
      if (students.length === 0) { skippedColumns++; continue; }
      if (isPlaceholderHeader(header[c])) {
        skippedColumns++;
        warnings.push(`«${teacherName}»: العمود «${header[c]}» شكله placeholder وفيه ${students.length} طالب — اتخطى`);
        continue;
      }

      const days = parseDays(header[c]);
      const time = parseTimeRange(header[c]);
      if (days.keys.length === 0) warnings.push(`«${teacherName}»: مفيش يوم واضح في «${header[c]}»`);
      if (!time) warnings.push(`«${teacherName}»: مفيش ميعاد واضح في «${header[c]}»`);

      groups.push({
        teacherName,
        rawHeader: header[c],
        name: extractGroupName({ rawHeader: header[c], teacherName, days, time }),
        days: days.keys,
        dayLabels: days.labels,
        startTime: time?.start || '',
        endTime: time?.end || '',
        timeLabel: time?.label || '',
        students,
      });

      totalSlots += students.length;
      for (const s of students) seenStudents.set(s, (seenStudents.get(s) || 0) + 1);
      teacherHasStudents = true;
    }

    if (teacherHasStudents && !teachers.includes(teacherName)) teachers.push(teacherName);
  }

  disambiguateGroups(groups);

  return {
    teachers,
    groups,
    uniqueStudents: [...seenStudents.keys()],
    totalSlots,
    multiGroupStudents: [...seenStudents.values()].filter(n => n > 1).length,
    skippedColumns,
    looksLikeCenterSheet: groups.some(g => g.days.length > 0 || !!g.timeLabel),
    warnings,
  };
}

// ==================== IMPORT INTO DB ====================

export interface SheetImportOptions {
  courseStrategy: CourseStrategy;
  /** سعر الاشتراك الشهري الافتراضي للكورسات الجديدة */
  coursePrice: number;
  /** مدة الكورس بالشهور */
  durationMonths: number;
  /** بداية أرقام التليفونات الـ placeholder (بيتضاف عليها 4 أرقام تسلسلية) */
  phonePrefix: string;
  /** أكبر عدد طلاب في المجموعة */
  maxStudents: number;
}

export const DEFAULT_IMPORT_OPTIONS: SheetImportOptions = {
  courseStrategy: 'byType',
  coursePrice: 0,
  durationMonths: 1,
  phonePrefix: '0100000',
  maxStudents: 40,
};

export interface SheetImportReport {
  teachersCreated: number;
  teachersExisting: number;
  coursesCreated: number;
  groupsCreated: number;
  groupsExisting: number;
  studentsCreated: number;
  studentsExisting: number;
  enrollmentsCreated: number;
  enrollmentsSkipped: number;
  errors: string[];
}

/**
 * كتابة الشيت في قاعدة البيانات:
 * مدرسين ← كورسات ← مجموعات ← طلاب ← تسجيلات (عن طريق enrollStudent
 * عشان الأقساط والقوائم تتظبط بنفس منطق التطبيق).
 *
 * الاستيراد idempotent: اللي موجود مش بيتكرر (المطابقة بالاسم).
 */
export async function importSheetIntoDb(
  parsed: SheetParseResult,
  opts: SheetImportOptions = DEFAULT_IMPORT_OPTIONS,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<SheetImportReport> {
  const report: SheetImportReport = {
    teachersCreated: 0, teachersExisting: 0,
    coursesCreated: 0,
    groupsCreated: 0, groupsExisting: 0,
    studentsCreated: 0, studentsExisting: 0,
    enrollmentsCreated: 0, enrollmentsSkipped: 0,
    errors: [],
  };

  const now = new Date().toISOString();
  const [existingTeachers, existingCourses, existingGroups, existingStudents] = await Promise.all([
    dbGetAll<Teacher>('teachers'),
    dbGetAll<Course>('courses'),
    dbGetAll<Group>('groups'),
    dbGetAll<Student>('students'),
  ]);

  const teacherByName = new Map(existingTeachers.map(t => [normalize(t.name), t]));
  const courseByName = new Map(existingCourses.map(c => [normalize(c.name), c]));
  const groupByKey = new Map(existingGroups.map(g => [`${g.teacherId}::${normalize(g.name)}`, g]));
  const studentByName = new Map(existingStudents.map(s => [normalize(s.name), s]));

  const totalSteps = parsed.teachers.length + parsed.groups.length
    + parsed.uniqueStudents.length + parsed.totalSlots;
  let step = 0;
  const tick = (label: string) => { step++; onProgress?.(step, totalSteps, label); };

  // ---------- 1) المدرسين ----------
  for (const name of parsed.teachers) {
    const key = normalize(name);
    if (teacherByName.has(key)) { report.teachersExisting++; continue; }
    const teacher: Teacher = {
      id: generateId(),
      name,
      specialization: 'غير محدد',
      phone: `${opts.phonePrefix}0000`,   // 01000000000 — placeholder
      salary: 0,
      status: 'active',
      notes: 'مضاف من شيت إكسيل',
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('teachers', teacher);
    teacherByName.set(key, teacher);
    report.teachersCreated++;
    tick(`مدرس: ${name}`);
  }

  // ---------- 2) الكورسات ----------
  const courseKeyFor = (group: ParsedGroup): string => {
    if (opts.courseStrategy === 'single') return 'Kids Zone';
    if (opts.courseStrategy === 'byTeacher') return group.teacherName;
    return courseFamily(group);
  };

  for (const group of parsed.groups) {
    const courseName = courseKeyFor(group);
    const key = normalize(courseName);
    if (courseByName.has(key)) continue;

    const course: Course = {
      id: generateId(),
      name: courseName,
      category: opts.courseStrategy === 'byTeacher' ? 'مجموعات مدرس' : 'مجموعات',
      description: 'كورس مُنشأ تلقائياً من شيت إكسيل',
      price: Math.max(0, opts.coursePrice),
      durationMonths: Math.max(1, opts.durationMonths),
      icon: '📘',
      color: '#6366f1',
      levels: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('courses', course);
    courseByName.set(key, course);
    report.coursesCreated++;
  }

  // ---------- 3) المجموعات ----------
  const resolvedGroupId = new Map<string, string>();
  const groupRef = (g: ParsedGroup) => `${g.teacherName}::${g.rawHeader}`;

  for (const g of parsed.groups) {
    const teacher = teacherByName.get(normalize(g.teacherName));
    if (!teacher) { report.errors.push(`مدرس مش موجود للمجموعة «${g.name}»`); continue; }
    const course = courseByName.get(normalize(courseKeyFor(g)));
    if (!course) { report.errors.push(`كورس مش موجود للمجموعة «${g.name}»`); continue; }

    const key = `${teacher.id}::${normalize(g.name)}`;
    const existing = groupByKey.get(key);
    if (existing) {
      resolvedGroupId.set(groupRef(g), existing.id);
      report.groupsExisting++;
      tick(`مجموعة: ${g.name}`);
      continue;
    }

    const schedule: ScheduleItem[] = [{
      days: g.days,
      startTime: g.startTime,
      endTime: g.endTime,
      room: '',
    }];

    const group: Group = {
      id: generateId(),
      name: g.name,
      courseId: course.id,
      teacherId: teacher.id,
      schedule,
      maxStudents: Math.max(opts.maxStudents, g.students.length),
      status: 'open',
      studentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('groups', group);
    groupByKey.set(key, group);
    resolvedGroupId.set(groupRef(g), group.id);
    report.groupsCreated++;
    tick(`مجموعة: ${g.name}`);
  }

  // ---------- 4) الطلاب ----------
  let phoneSeq = 1;
  for (const name of parsed.uniqueStudents) {
    const key = normalize(name);
    if (studentByName.has(key)) { report.studentsExisting++; continue; }

    // 0100000 + 0001 = 01000000001 (11 رقم) — placeholder المستخدم هيعدّله
    const phone = `${opts.phonePrefix}${String(phoneSeq).padStart(4, '0')}`;
    phoneSeq++;
    const student: Student = {
      id: generateId(),
      name,
      age: 5 + Math.floor(Math.random() * 11),   // 5 – 15 (placeholder، المستخدم هيعدلها)
      gender: guessGender(name),
      phone,
      parentPhone: phone,
      notes: 'مضاف من شيت إكسيل',
      status: 'active',
      totalPaid: 0,
      enrolledGroups: [],
      createdAt: now,
      updatedAt: now,
    };
    await dbAdd('students', student);
    studentByName.set(key, student);
    report.studentsCreated++;
    tick(`طالب: ${name}`);
  }

  // ---------- 5) التسجيلات (عن طريق enrollStudent) ----------
  for (const g of parsed.groups) {
    const groupId = resolvedGroupId.get(groupRef(g));
    if (!groupId) continue;

    for (const studentName of g.students) {
      const student = studentByName.get(normalize(studentName));
      if (!student) { report.errors.push(`طالب مش موجود: ${studentName}`); continue; }

      const result = await enrollStudent(student.id, groupId);
      if (result.success) {
        report.enrollmentsCreated++;
      } else {
        report.enrollmentsSkipped++;
        if (!result.error?.includes('بالفعل')) {
          report.errors.push(`${studentName} ← ${g.name}: ${result.error}`);
        }
      }
      tick(`تسجيل: ${studentName}`);
    }
  }

  // ---------- 6) تحديث حالة المجموعات ----------
  for (const groupId of new Set(resolvedGroupId.values())) {
    const fresh = await dbGetById<Group>('groups', groupId);
    if (!fresh || fresh.status === 'ended') continue;
    const next = fresh.studentIds.length >= fresh.maxStudents ? 'full' : 'open';
    if (fresh.status !== next) {
      await dbAdd('groups', { ...fresh, status: next, updatedAt: new Date().toISOString() });
    }
  }

  return report;
}
