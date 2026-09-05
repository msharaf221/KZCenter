/**
 * اختبارات استيراد شيت إكسيل.
 * الجزء الأول بيشتغل على شيت صناعي متبني جوّه الاختبار نفسه
 * (بعناوين منسوخة حرفياً من شيت المركز الحقيقي).
 * الجزء التاني (اختياري) بيشتغل على الشيت الحقيقي لو موجود في tmp/.
 */
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { buildXlsxBuffer, type SheetSpec } from './helpers/excel';
import {
  parseSheetBuffer, parseDays, parseTimeRange, extractGroupName,
  isPlaceholderHeader, guessGender, courseFamily, importSheetIntoDb,
  DEFAULT_IMPORT_OPTIONS,
} from '../lib/sheetImport';
import {
  dbGetAll, dbGetById, dbClearStore,
  Group, Student, Enrollment, Installment, Teacher, Course,
} from '../lib/db';

// ==================== helpers ====================

/** شيت صغير بعناوين حقيقية من ملف المركز — يُبنى قبل الاختبارات (exceljs async). */
let SAMPLE: Uint8Array;
async function makeWorkbook(sheets: SheetSpec[]): Promise<Uint8Array> {
  return buildXlsxBuffer(sheets);
}

const SAMPLE_SHEETS: SheetSpec[] = [
  {
    name: 'ولاء',
    rows: [
      ['s.r 1 السبت من 4/5', 's.r 2 -3 السبت من 7/8', 'الاحد من 5/6', 'عمود4'],
      ['ليلي صلاح احمد محمد', 'كارما احمد سعد ابوبكر', 'فرح باسم طلعت علي', ''],
      ['ادم طلال عطيه رمضان', 'مكه حسن شحاته احمد', '', ''],
      ['', 'محمد يوسف فرج مرعي', '', ''],
    ],
  },
  {
    name: 'هاجر',
    rows: [
      ['s.r الاثنين والخميس من 7/8', 'مناهج اولي السب من 5/6'],
      ['ليلي صلاح احمد محمد', 'سليم احمد محمد اسماعيل'],
      ['عمر مؤمن محمد السيد', ''],
    ],
  },
  {
    name: 'ايمان عبدالرحيم',
    rows: [
      ['level 3 السبت من 4/5', 'level 3 السبت من5/6', 'gr 8'],
      ['تاليا علي محمد صقر', 'تاليا علي محمد صقر', ''],
      ['', 'امل احمد اسماعيل الشهاوي', ''],
    ],
  },
  {
    name: '17',
    rows: [['عمود1', 'عمود2']],
  },
];

beforeAll(async () => {
  SAMPLE = await makeWorkbook(SAMPLE_SHEETS);
});

async function clearAll() {
  for (const store of ['installments', 'enrollments', 'students', 'groups', 'teachers', 'courses'] as const) {
    await dbClearStore(store);
  }
}

// ==================== pure parsing ====================

describe('parseTimeRange', () => {
  it('يحول 4/5 لـ 16:00 – 17:00', () => {
    expect(parseTimeRange('s.r 1 السبت من 4/5')).toEqual({ start: '16:00', end: '17:00', label: '4/5' });
  });

  it('يحوّل 7/8 لـ 19:00 – 20:00 من غير مسافات', () => {
    expect(parseTimeRange('s.r3 السبت من6/7')).toEqual({ start: '18:00', end: '19:00', label: '6/7' });
  });

  it('مايقراش «s.r 2 -3» على إنها ميعاد', () => {
    expect(parseTimeRange('s.r 2 -3 السبت من 7/8')).toEqual({ start: '19:00', end: '20:00', label: '7/8' });
  });

  it('يرجع null لو مفيش ميعاد', () => {
    expect(parseTimeRange('fast /fluent')).toBeNull();
    expect(parseTimeRange('اقرا 2')).toBeNull();
  });
});

describe('parseDays', () => {
  it('يستخرج يوم واحد', () => {
    expect(parseDays('s.r 1 السبت من 4/5')).toEqual({ keys: ['saturday'], labels: ['السبت'] });
  });

  it('يستخرج يومين «الاثنين والخميس»', () => {
    expect(parseDays('s.r الاثنين والخميس من 7/8').keys).toEqual(['monday', 'thursday']);
  });

  it('يستخرج «السبت والثلاث»', () => {
    expect(parseDays('s.r 2 السبت والثلاث 6/7').keys).toEqual(['tuesday', 'saturday']);
  });

  it('يعالج الأخطاء الإملائية (السيت / السب / الثلاث)', () => {
    expect(parseDays('مجموعه 6 السيت من 5/6').keys).toEqual(['saturday']);
    expect(parseDays('مناهج اولي السب من 5/6').keys).toEqual(['saturday']);
    expect(parseDays('مجموعة التلات 5/6').keys).toEqual(['tuesday']);
  });

  it('بيرتب الأيام ترتيب الأسبوع', () => {
    expect(parseDays('الخميس والاحد 5/6').keys).toEqual(['sunday', 'thursday']);
  });
});

describe('extractGroupName', () => {
  const nameOf = (rawHeader: string, teacherName = 'ولاء') => {
    const days = parseDays(rawHeader);
    const time = parseTimeRange(rawHeader);
    return extractGroupName({ rawHeader, teacherName, days, time });
  };

  it('يشيل اليوم والميعاد وكلمة «من»', () => {
    expect(nameOf('s.r 1 السبت من 4/5')).toBe('s.r 1');
    expect(nameOf('s.r3 السبت من6/7')).toBe('s.r3');
    expect(nameOf('grammer 3 الاثنين من 4/5')).toBe('grammer 3');
    expect(nameOf('اقرا 5 الاثنين 5/6')).toBe('اقرا 5');
    expect(nameOf('مستوي 3 الاثنين من 6/7')).toBe('مستوي 3');
  });

  it('مايقصّش أرقام اسم المجموعة', () => {
    expect(nameOf('s.r 2 -3 السبت من 7/8')).toBe('s.r 2 -3');
  });

  it('يعالج الأخطاء الإملائية في اليوم', () => {
    expect(nameOf('مناهج اولي السب من 5/6')).toBe('مناهج اولي 5/6');
    expect(nameOf('مجموعه 6 السيت من 5/6')).toBe('مجموعه 6');
  });

  it('لو العنوان يوم وميعاد بس → اسم بديل من المدرس', () => {
    expect(nameOf('الاحد من 5/6', 'سمر جمال')).toBe('سمر جمال - الاحد 5/6');
  });

  it('اسم من غير رقم → يتضاف له الميعاد عشان يبقى مميز', () => {
    expect(nameOf('حساب السبت من 6/7')).toBe('حساب 6/7');
    expect(nameOf('s.r الاثنين والخميس من 7/8', 'هاجر')).toBe('s.r 7/8');
  });

  it('عنوان من غير يوم ولا ميعاد يفضل زي ما هو', () => {
    expect(nameOf('fast /fluent', 'اسماء سعيد')).toBe('fast /fluent');
  });
});

describe('isPlaceholderHeader', () => {
  it('يتعرف على الأعمدة الفاضية', () => {
    expect(isPlaceholderHeader('عمود5')).toBe(true);
    expect(isPlaceholderHeader('Column3')).toBe(true);
    expect(isPlaceholderHeader('gr 8')).toBe(true);
    expect(isPlaceholderHeader('')).toBe(true);
    expect(isPlaceholderHeader('   ')).toBe(true);
  });

  it('مايتعرفش على المجموعات الحقيقية', () => {
    expect(isPlaceholderHeader('s.r 1 السبت من 4/5')).toBe(false);
    expect(isPlaceholderHeader('fast /fluent')).toBe(false);
  });
});

describe('guessGender', () => {
  it('يتعرف على أسماء بنات شائعة', () => {
    expect(guessGender('فاطمه محمد عشري عبدالموجود')).toBe('female');
    expect(guessGender('مريم احمد علي')).toBe('female');
    expect(guessGender('جودي حسام عطا علي')).toBe('female');
  });

  it('الافتراضي ولد', () => {
    expect(guessGender('ادم طلال عطيه رمضان')).toBe('male');
    expect(guessGender('محمد خالد محمد عبدالباري')).toBe('male');
  });
});

describe('courseFamily', () => {
  it('يشيل الأرقام عشان يطلع نوع المجموعة', () => {
    expect(courseFamily({ name: 's.r 1', teacherName: 'ولاء' })).toBe('s.r');
    expect(courseFamily({ name: 'اقرا 5', teacherName: 'هدير' })).toBe('اقرا');
  });

  it('لو الاسم بديل من اسم المدرس → الكورس باسم المدرس', () => {
    expect(courseFamily({ name: 'سمر جمال - الاحد 5/6', teacherName: 'سمر جمال' })).toBe('سمر جمال');
  });
});

// ==================== workbook parsing ====================

describe('parseSheetBuffer', () => {
  it('بيقرا المدرسين والمجموعات والطلاب', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);

    // شيت «17» فاضي → مش مدرس
    expect(parsed.teachers).toEqual(['ولاء', 'هاجر', 'ايمان عبدالرحيم']);
    expect(parsed.groups).toHaveLength(3 + 2 + 2);
    expect(parsed.skippedColumns).toBeGreaterThan(0);
  });

  it('بيتخطى الأعمدة الفاضية والـ placeholders', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    const names = parsed.groups.map(g => g.name);
    expect(names).not.toContain('عمود4');
    expect(names).not.toContain('gr 8');
    expect(parsed.groups.every(g => g.students.length > 0)).toBe(true);
  });

  it('بيظبط الميعاد والأيام في الجدول', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    const g = parsed.groups.find(x => x.rawHeader === 's.r 1 السبت من 4/5')!;
    expect(g.days).toEqual(['saturday']);
    expect(g.startTime).toBe('16:00');
    expect(g.endTime).toBe('17:00');
    expect(g.name).toBe('s.r 1');
  });

  it('الطالب المتكرر في أكتر من مجموعة بيظهر مرة واحدة بس', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    // «ليلي صلاح احمد محمد» في ولاء/س.r 1 و هاجر/s.r 7/8، و«تاليا» مرتين عند ايمان
    expect(parsed.uniqueStudents.filter(n => n === 'ليلي صلاح احمد محمد')).toHaveLength(1);
    expect(parsed.totalSlots).toBe(12);
    expect(parsed.uniqueStudents).toHaveLength(10);
    expect(parsed.multiGroupStudents).toBe(2);
  });

  it('بيميز شيت المركز عن أي ملف إكسيل تاني', async () => {
    expect((await parseSheetBuffer(await SAMPLE)).looksLikeCenterSheet).toBe(true);

    const junk = await makeWorkbook([{ name: 'Sheet1', rows: [['hello'], ['world']] }]);
    expect((await parseSheetBuffer(await junk)).looksLikeCenterSheet).toBe(false);
  });

  it('بيفضّ اشتباك مجموعتين بنفس الاسم لنفس المدرس', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    const eiman = parsed.groups.filter(g => g.teacherName === 'ايمان عبدالرحيم').map(g => g.name);
    expect(new Set(eiman).size).toBe(eiman.length);
    expect(eiman).toContain('level 3 (السبت 4/5)');
    expect(eiman).toContain('level 3 (السبت 5/6)');
  });
});

// ==================== import into db ====================

describe('importSheetIntoDb', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('بينشئ المدرسين والكورسات والمجموعات والطلاب والتسجيلات', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    const report = await importSheetIntoDb(parsed, {
      ...DEFAULT_IMPORT_OPTIONS,
      courseStrategy: 'byType',
      coursePrice: 800,
    });

    expect(report.teachersCreated).toBe(3);
    expect(report.groupsCreated).toBe(7);
    // 7 طلاب فريدين: ليلي، ادم، كارما، مكه، محمد يوسف، فرح، عمر، سليم، تاليا، امل
    expect(report.studentsCreated).toBe(parsed.uniqueStudents.length);
    expect(report.enrollmentsCreated).toBe(parsed.totalSlots);
    expect(report.errors).toEqual([]);

    const teachers = await dbGetAll<Teacher>('teachers');
    expect(teachers.map(t => t.name).sort()).toEqual(['ايمان عبدالرحيم', 'ولاء', 'هاجر'].sort());

    const courses = await dbGetAll<Course>('courses');
    // s.r (ولاء+هاجر)، level (ايمان)، مناهج اولي (هاجر)، ولاء (مجموعة اسمها بديل من اسم المدرس)
    expect(courses.map(c => c.name).sort()).toEqual(['s.r', 'level', 'مناهج اولي', 'ولاء'].sort());
    expect(courses.every(c => c.price === 800)).toBe(true);
  });

  it('الطالب المتكرر بيتسجل في المجموعتين بنفس الـ id', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    await importSheetIntoDb(parsed);

    const students = await dbGetAll<Student>('students');
    const layla = students.find(s => s.name === 'ليلي صلاح احمد محمد')!;
    expect(students.filter(s => s.name === 'ليلي صلاح احمد محمد')).toHaveLength(1);

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    const mine = enrollments.filter(e => e.studentId === layla.id);
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map(e => e.groupId)).size).toBe(2);
  });

  it('بينشئ أقساط لكل تسجيل', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    await importSheetIntoDb(parsed, { ...DEFAULT_IMPORT_OPTIONS, coursePrice: 800 });

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    const installments = await dbGetAll<Installment>('installments');
    expect(installments.length).toBeGreaterThan(0);

    const layla = (await dbGetAll<Student>('students')).find(s => s.name === 'ليلي صلاح احمد محمد')!;
    const laylaInst = installments.filter(i => i.studentId === layla.id);
    expect(laylaInst).toHaveLength(2);
    expect(laylaInst.every(i => i.amount === 800 && i.status === 'pending')).toBe(true);
    expect(enrollments.filter(e => e.studentId === layla.id)).toHaveLength(2);
  });

  it('الاستيراد التاني ما يكررش حاجة (idempotent)', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    await importSheetIntoDb(parsed);
    const second = await importSheetIntoDb(parsed);

    expect(second.teachersCreated).toBe(0);
    expect(second.teachersExisting).toBe(3);
    expect(second.groupsCreated).toBe(0);
    expect(second.studentsCreated).toBe(0);
    expect(second.enrollmentsCreated).toBe(0);
    expect(second.enrollmentsSkipped).toBe(parsed.totalSlots);

    expect(await dbGetAll('students')).toHaveLength(parsed.uniqueStudents.length);
    expect(await dbGetAll('groups')).toHaveLength(7);
  });

  it('بيحدّث حالة المجموعة لـ full لما العدد يوصل للحد', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    await importSheetIntoDb(parsed, { ...DEFAULT_IMPORT_OPTIONS, maxStudents: 2 });

    const groups = await dbGetAll<Group>('groups');
    const walaFirst = groups.find(g => g.name === 's.r 1')!;
    expect(walaFirst.maxStudents).toBeGreaterThanOrEqual(2);
    const walaById = await dbGetById<Group>('groups', walaFirst.id);
    expect(walaById!.status).toBe('full');
  });

  it('بيراعي المدرسين الموجودين أصلاً (ما يكررش بالاسم)', async () => {
    const parsed = await parseSheetBuffer(await SAMPLE);
    await importSheetIntoDb(parsed);

    // نضيف مجموعة جديدة لمدرس موجود في شيت تاني
    const extra = makeWorkbook([
      { name: 'ولاء', rows: [['جديده الاحد من 6/7'], ['طالب جديد تمام']] },
    ]);
    const report = await importSheetIntoDb(await parseSheetBuffer(await extra));
    expect(report.teachersCreated).toBe(0);
    expect(report.teachersExisting).toBe(1);
    expect(report.groupsCreated).toBe(1);
    expect(report.studentsCreated).toBe(1);
    expect((await dbGetAll('teachers')).length).toBe(3);
  });
});

// ==================== real file (optional, local only) ====================

const REAL_FILE = path.resolve(process.cwd(), 'tmp/kidszone.xlsx');
describe.skipIf(!fs.existsSync(REAL_FILE))('الشيت الحقيقي (tmp/kidszone.xlsx)', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('بيقرا كل المدرسين والطلاب', async () => {
    const parsed = await parseSheetBuffer(await fs.readFileSync(REAL_FILE));

    expect(parsed.teachers).toHaveLength(16);
    expect(parsed.uniqueStudents).toHaveLength(771);
    expect(parsed.totalSlots).toBe(1062);
    expect(parsed.multiGroupStudents).toBe(218);

    // مفيش مجموعتين بنفس الاسم لنفس المدرس
    const keys = parsed.groups.map(g => `${g.teacherName}::${g.name}`);
    expect(new Set(keys).size).toBe(keys.length);

    // كل مجموعة ليها يوم وميعاد ما عدا fast /fluent
    const noTime = parsed.groups.filter(g => !g.startTime);
    expect(noTime.map(g => g.rawHeader)).toEqual(['fast /fluent']);

    // eslint-disable-next-line no-console
    console.log(
      `[الشيت الحقيقي] مدرسين=${parsed.teachers.length} مجموعات=${parsed.groups.length} ` +
      `طلاب=${parsed.uniqueStudents.length} خانات=${parsed.totalSlots} ` +
      `متكرر=${parsed.multiGroupStudents} تنبيهات=${parsed.warnings.length}`
    );
  });

  it('بيكتب الشيت كله في القاعدة من غير أخطاء', async () => {
    const parsed = await parseSheetBuffer(await fs.readFileSync(REAL_FILE));
    const report = await importSheetIntoDb(parsed, {
      ...DEFAULT_IMPORT_OPTIONS,
      courseStrategy: 'byType',
      coursePrice: 800,
    });

    const [teachers, courses, groups, students, enrollments, installments] = await Promise.all([
      dbGetAll<Teacher>('teachers'), dbGetAll<Course>('courses'), dbGetAll<Group>('groups'),
      dbGetAll<Student>('students'), dbGetAll<Enrollment>('enrollments'),
      dbGetAll<Installment>('installments'),
    ]);

    expect(report.errors).toEqual([]);
    expect(report.enrollmentsCreated).toBe(1062);
    expect(teachers).toHaveLength(16);
    expect(groups).toHaveLength(75);
    expect(students).toHaveLength(771);
    expect(enrollments.filter(e => e.status === 'active')).toHaveLength(1062);
    expect(installments).toHaveLength(1062);
    expect(courses.length).toBeGreaterThan(0);

    // الطالب اللي في كذا مجموعة ليه ملف واحد بس ومقيّد في كل مجموعاته
    expect(students.filter(s => s.enrolledGroups.length > 1)).toHaveLength(218);
    // الأرقام والأعمار placeholders
    expect(students.every(s => /^\d{11}$/.test(s.parentPhone))).toBe(true);
    expect(students.every(s => s.age >= 3 && s.age <= 18)).toBe(true);
    // مفيش مجموعة عدّت السعة
    expect(groups.every(g => g.studentIds.length <= g.maxStudents)).toBe(true);

    // eslint-disable-next-line no-console
    console.log(
      `[استيراد الشيت الحقيقي] مدرسين=${teachers.length} كورسات=${courses.length} ` +
      `مجموعات=${groups.length} طلاب=${students.length} تسجيلات=${enrollments.length}`
    );
  }, 300000);
});
