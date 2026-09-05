/**
 * اختبارات مطابقة الطلاب في استيراد الشيت — src/lib/sheetImport.ts
 *
 * المشكلة القديمة: المطابقة كانت **بالاسم فقط**، والشيتات الحقيقية فيها:
 *  - أسماء متشابهة/مكررة (طالبين بنفس الاسم بيتدمجوا في واحد)
 *  - تليفونات مكتوبة جنب الاسم في نفس الخلية
 *  - طالب موجود بالفعل بيتعمله نسخة مكررة
 * دلوقتي المطابقة بالتليفون الأول، وبعدين بالاسم الموحّد، والغموض بيتسجل للمراجعة.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildXlsxBuffer, type SheetSpec } from './helpers/excel';
import {
  extractPhone, parseSheetBuffer, importSheetIntoDb, foldArabic,
} from '../lib/sheetImport';
import {
  dbAdd, dbGetAll, dbClearStore, generateId,
  type Student, type Enrollment, type Group,
} from '../lib/db';

const NOW = '2026-03-10T10:00:00.000Z';

async function makeWorkbook(sheets: SheetSpec[]): Promise<Uint8Array> {
  return buildXlsxBuffer(sheets);
}

/** شيت بعمود واحد ومجموعة واحدة — أبسط حالة للتركيز على منطق المطابقة */
function sheetWithStudents(names: string[], sheetName = 'ولاء'): Promise<Uint8Array> {
  return makeWorkbook([
    { name: sheetName, rows: [['s.r السبت من 4/5'], ...names.map(n => [n])] },
  ]);
}

async function clearAll() {
  for (const store of ['installments', 'enrollments', 'students', 'groups', 'teachers', 'courses', 'payments'] as const) {
    await dbClearStore(store);
  }
}

async function seedStudent(o: Partial<Student> & { name: string }): Promise<Student> {
  const student: Student = {
    id: generateId(),
    name: o.name,
    age: o.age ?? 12,
    gender: o.gender ?? 'male',
    phone: o.phone,
    parentPhone: o.parentPhone ?? '01000000000',
    status: o.status ?? 'active',
    totalPaid: o.totalPaid ?? 0,
    enrolledGroups: o.enrolledGroups ?? [],
    createdAt: NOW,
    updatedAt: NOW,
  };
  await dbAdd('students', student);
  return student;
}

beforeEach(async () => {
  await clearAll();
});

describe('extractPhone — استخراج التليفون من الخلية', () => {
  it('اسم من غير رقم بيرجع زي ما هو', async () => {
    expect(extractPhone('أحمد محمد علي')).toEqual({ name: 'أحمد محمد علي' });
  });

  it('رقم بعد الاسم', async () => {
    const r = extractPhone('أحمد محمد 01012345678');
    expect(r.phone).toBe('01012345678');
    expect(r.name).toBe('أحمد محمد');
  });

  it('رقم قبل الاسم', async () => {
    const r = extractPhone('01012345678 أحمد محمد');
    expect(r.phone).toBe('01012345678');
    expect(r.name).toBe('أحمد محمد');
  });

  it('رقم من غير الصفر الأول', async () => {
    expect(extractPhone('أحمد 1012345678').phone).toBe('01012345678');
  });

  it('الصيغة الدولية +20', async () => {
    expect(extractPhone('أحمد +201012345678').phone).toBe('01012345678');
    expect(extractPhone('أحمد 201012345678').phone).toBe('01012345678');
  });

  it('رقم متقطع بشرط ومسافات', async () => {
    expect(extractPhone('أحمد 010-1234-5678').phone).toBe('01012345678');
    expect(extractPhone('أحمد 010 1234 5678').phone).toBe('01012345678');
    expect(extractPhone('أحمد 010(1234)5678').phone).toBe('01012345678');
  });

  it('كل شبكات الموبايل المصري', async () => {
    for (const p of ['01012345678', '01112345678', '01212345678', '01512345678']) {
      expect(extractPhone(`طالب ${p}`).phone).toBe(p);
    }
  });

  it('أرقام مش موبايل ما تتحسبش تليفون', async () => {
    expect(extractPhone('أحمد 123').phone).toBeUndefined();
    expect(extractPhone('أحمد 0212345678').phone).toBeUndefined();   // أرضي قديم
    expect(extractPhone('أحمد 2026').phone).toBeUndefined();
  });

  it('الخلية الفاضية', async () => {
    expect(extractPhone('')).toEqual({ name: '' });
    expect(extractPhone(undefined as unknown as string).phone).toBeUndefined();
  });

  it('الاسم بيتنضف من الفواصل الزايدة', async () => {
    const r = extractPhone('أحمد  -  محمد   01012345678');
    expect(r.name).toBe('أحمد محمد');
  });

  it('لو الخلية كلها رقم (مفيش اسم) الاسم ما يفضلش فاضي', async () => {
    const r = extractPhone('01012345678');
    expect(r.phone).toBe('01012345678');
    expect(r.name).toBe('01012345678');
  });
});

describe('parseSheetBuffer — studentMeta', () => {
  it('بيستخرج التليفونات مع الأسماء', async () => {
    const parsed = await parseSheetBuffer(await sheetWithStudents([
      'أحمد محمد 01012345678',
      'منى علي',
      'سارة حسن 01198765432',
    ]));

    expect(parsed.uniqueStudents).toEqual(['أحمد محمد', 'منى علي', 'سارة حسن']);
    expect(parsed.studentMeta).toHaveLength(3);
    expect(parsed.studentMeta[0]).toMatchObject({ name: 'أحمد محمد', phone: '01012345678' });
    expect(parsed.studentMeta[1].phone).toBeUndefined();
    expect(parsed.studentMeta[2].phone).toBe('01198765432');
  });

  it('قوائم الطلاب في المجموعات من غير أرقام (نظيفة للعرض)', async () => {
    const parsed = await parseSheetBuffer(await sheetWithStudents(['أحمد محمد 01012345678']));
    expect(parsed.groups[0].students).toEqual(['أحمد محمد']);
  });

  it('نفس الطالب في مجموعتين بيظهر مرة واحدة في meta', async () => {
    const parsed = await parseSheetBuffer(await makeWorkbook([
      { name: 'ولاء', rows: [['s.r السبت من 4/5', 's.r الاحد من 5/6'], ['أحمد محمد 01012345678', 'أحمد محمد 01012345678']] },
    ]));
    expect(parsed.studentMeta).toHaveLength(1);
    expect(parsed.studentMeta[0].phone).toBe('01012345678');
    expect(parsed.uniqueStudents).toHaveLength(1);
  });

  it('اسم واحد برقمين مختلفين → duplicateNames', async () => {
    const parsed = await parseSheetBuffer(await makeWorkbook([
      { name: 'ولاء', rows: [['s.r السبت من 4/5', 's.r الاحد من 5/6'], ['أحمد محمد 01012345678', 'أحمد محمد 01198765432']] },
    ]));
    expect(parsed.duplicateNames).toEqual(['أحمد محمد']);
  });

  it('اسم من غير رقم مش duplicate', async () => {
    const parsed = await parseSheetBuffer(await makeWorkbook([
      { name: 'ولاء', rows: [['s.r السبت من 4/5', 's.r الاحد من 5/6'], ['أحمد محمد', 'أحمد محمد']] },
    ]));
    expect(parsed.duplicateNames).toEqual([]);
  });

  it('لو ظهر الرقم في خلية والاسم لوحده في تانية، الرقم بيتحفظ', async () => {
    const parsed = await parseSheetBuffer(await makeWorkbook([
      { name: 'ولاء', rows: [['s.r السبت من 4/5', 's.r الاحد من 5/6'], ['أحمد محمد', 'أحمد محمد 01012345678']] },
    ]));
    expect(parsed.studentMeta).toHaveLength(1);
    expect(parsed.studentMeta[0].phone).toBe('01012345678');
  });
});

describe('importSheetIntoDb — المطابقة بالتليفون', () => {
  it('طالب موجود بنفس الرقم ما يتكررش حتى لو الاسم مكتوب بشكل مختلف', async () => {
    await seedStudent({ name: 'احمد محمد علي', parentPhone: '01012345678' });

    const parsed = await parseSheetBuffer(await sheetWithStudents(['أحمد محمد علي 01012345678']));
    const report = await importSheetIntoDb(parsed);

    expect(report.studentsCreated).toBe(0);
    expect(report.studentsExisting).toBe(1);
    expect(report.studentsMatchedByPhone).toBe(1);

    const students = await dbGetAll<Student>('students');
    expect(students).toHaveLength(1);
    expect(students[0].name).toBe('احمد محمد علي');   // الاسم الأصلي ما اتغيرش
  });

  it('الرقم في خانة الطالب نفسه كمان بيتطابق', async () => {
    await seedStudent({ name: 'منى', phone: '01198765432', parentPhone: '01000000000' });

    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['منى علي 01198765432'])));
    expect(report.studentsMatchedByPhone).toBe(1);
    expect(await dbGetAll<Student>('students')).toHaveLength(1);
  });

  it('صيغ الرقم المختلفة بتتطابق (+20 / من غير صفر / بشرط)', async () => {
    await seedStudent({ name: 'أحمد', parentPhone: '01012345678' });

    for (const written of ['أحمد محمد +201012345678', 'أحمد محمد 1012345678', 'أحمد محمد 010-1234-5678']) {
      await clearAll();
      await seedStudent({ name: 'أحمد', parentPhone: '01012345678' });
      const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents([written])));
      expect(report.studentsMatchedByPhone, written).toBe(1);
      expect(report.studentsCreated, written).toBe(0);
    }
  });

  it('طالب جديد برقم حقيقي بيتحفظ رقمه (مش placeholder)', async () => {
    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['طالب جديد 01099998888'])));
    expect(report.studentsCreated).toBe(1);

    const [student] = await dbGetAll<Student>('students');
    expect(student.phone).toBe('01099998888');
    expect(student.parentPhone).toBe('01099998888');
    expect(student.notes).toBe('مضاف من شيت إكسيل');
  });

  it('طالب جديد من غير رقم بياخد placeholder وملاحظة توضح', async () => {
    await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['طالب من غير رقم'])));
    const [student] = await dbGetAll<Student>('students');
    expect(student.phone).toMatch(/^0100000\d{4}$/);
    expect(student.notes).toContain('placeholder');
  });

  it('الـ placeholders بتتسلسل وما تتكررش', async () => {
    await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['واحد', 'اتنين', 'تلاتة'])));
    const phones = (await dbGetAll<Student>('students')).map(s => s.phone);
    expect(new Set(phones).size).toBe(3);
  });
});

describe('importSheetIntoDb — المطابقة بالاسم', () => {
  it('اسم موجود بيتطابق (مفيش تكرار)', async () => {
    await seedStudent({ name: 'ليلي صلاح احمد محمد' });
    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['ليلي صلاح احمد محمد'])));

    expect(report.studentsExisting).toBe(1);
    expect(report.studentsCreated).toBe(0);
    expect(report.studentsMatchedByPhone).toBe(0);
    expect(await dbGetAll<Student>('students')).toHaveLength(1);
  });

  it('التوحيد بيصلح الهمزات والتاء المربوطة والي', async () => {
    expect(foldArabic('أحمد')).toBe(foldArabic('احمد'));
    expect(foldArabic('فاطمة')).toBe(foldArabic('فاطمه'));
    expect(foldArabic('على')).toBe(foldArabic('علي'));
    expect(foldArabic('إبراهيم')).toBe(foldArabic('ابراهيم'));
  });

  it('اسم موجود بهمْزة مختلفة بيتطابق', async () => {
    await seedStudent({ name: 'احمد محمد' });
    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد'])));
    expect(report.studentsExisting).toBe(1);
    expect(report.studentsCreated).toBe(0);
  });

  it('المسافات الزايدة ما تمنعش المطابقة', async () => {
    await seedStudent({ name: 'أحمد   محمد' });
    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد'])));
    expect(report.studentsCreated).toBe(0);
  });

  it('اسم مختلف = طالب جديد', async () => {
    await seedStudent({ name: 'أحمد محمد' });
    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['منى علي'])));
    expect(report.studentsCreated).toBe(1);
    expect(await dbGetAll<Student>('students')).toHaveLength(2);
  });
});

describe('importSheetIntoDb — الأسماء المكررة (الغموض)', () => {
  it('اسم مطابق لطالبين موجودين → بيتسجل للمراجعة ومش بيخلق تالت', async () => {
    await seedStudent({ name: 'أحمد محمد', parentPhone: '01000000001' });
    await seedStudent({ name: 'أحمد محمد', parentPhone: '01000000002' });

    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد'])));

    expect(report.studentsCreated).toBe(0);
    expect(report.studentsExisting).toBe(1);
    expect(report.ambiguousStudents).toEqual(['أحمد محمد']);
    expect(report.errors.some(e => e.includes('أحمد محمد') && e.includes('مرات'))).toBe(true);
    expect(await dbGetAll<Student>('students')).toHaveLength(2);   // مفيش نسخة تالتة
  });

  it('التليفون بيحسم الغموض (ما يبقى ambiguous)', async () => {
    const second = await seedStudent({ name: 'أحمد محمد', parentPhone: '01000000002' });
    await seedStudent({ name: 'أحمد محمد', parentPhone: '01000000001' });

    const report = await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد 01000000002'])));

    expect(report.ambiguousStudents).toEqual([]);
    expect(report.studentsMatchedByPhone).toBe(1);
    expect(report.studentsCreated).toBe(0);

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    expect(enrollments[0].studentId).toBe(second.id);   // التسجيل راح للطالب الصح
  });

  it('الاسم المكرر بيتسجل مرة واحدة في القائمة', async () => {
    await seedStudent({ name: 'منى علي', parentPhone: '01000000003' });
    await seedStudent({ name: 'منى علي', parentPhone: '01000000004' });

    const report = await importSheetIntoDb(await parseSheetBuffer(await makeWorkbook([
      { name: 'ولاء', rows: [['s.r السبت من 4/5', 's.r الاحد من 5/6'], ['منى علي', 'منى علي']] },
    ])));

    expect(report.ambiguousStudents.filter(n => n === 'منى علي')).toHaveLength(1);
  });

  it('اسم مكرر في الشيت برقمين مختلفين → تنبيه', async () => {
    const report = await importSheetIntoDb(await parseSheetBuffer(await makeWorkbook([
      { name: 'ولاء', rows: [['s.r السبت من 4/5', 's.r الاحد من 5/6'], ['أحمد محمد 01012345678', 'أحمد محمد 01198765432']] },
    ])));

    expect(report.errors.some(e => e.includes('أحمد محمد') && e.includes('أكتر من رقم'))).toBe(true);
    // الاتنين بيتسجلوا (لأن الأرقام مختلفة = غالباً شخصين)
    expect(report.studentsCreated).toBe(1);   // طالب فريد واحد في meta (أول رقم بيتحفظ)
  });
});

describe('importSheetIntoDb — التسجيلات بعد المطابقة', () => {
  it('الطالب المتطابق بالتليفون بيتسجل في المجموعة', async () => {
    const existing = await seedStudent({ name: 'احمد محمد', parentPhone: '01012345678' });

    await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد علي 01012345678'])));

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].studentId).toBe(existing.id);

    const group = await dbGetAll<Group>('groups');
    expect(group[0].studentIds).toContain(existing.id);
  });

  it('الطالب المتطابق بالاسم بيتسجل في المجموعة', async () => {
    const existing = await seedStudent({ name: 'ليلي صلاح' });
    await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['ليلي صلاح'])));

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    expect(enrollments[0].studentId).toBe(existing.id);
  });

  it('الاستيراد مرتين idempotent (مفيش طلاب ولا مجموعات مكررة)', async () => {
    const buffer = sheetWithStudents(['أحمد محمد 01012345678', 'منى علي']);
    const first = await importSheetIntoDb(await parseSheetBuffer(await buffer));
    const second = await importSheetIntoDb(await parseSheetBuffer(await buffer));

    expect(first.studentsCreated).toBe(2);
    expect(second.studentsCreated).toBe(0);
    expect(second.studentsExisting).toBe(2);
    expect(await dbGetAll<Student>('students')).toHaveLength(2);
  });

  it('استيراد تاني بنفس الرقم بيضيف المجموعة الجديدة بس', async () => {
    await seedStudent({ name: 'أحمد', parentPhone: '01012345678' });
    await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد 01012345678'])));
    const afterFirst = await dbGetAll<Enrollment>('enrollments');

    await importSheetIntoDb(await parseSheetBuffer(await sheetWithStudents(['أحمد محمد 01012345678'], 'هاجر')));
    const afterSecond = await dbGetAll<Enrollment>('enrollments');

    expect(afterFirst).toHaveLength(1);
    expect(afterSecond).toHaveLength(2);
    expect(await dbGetAll<Student>('students')).toHaveLength(1);
  });
});
