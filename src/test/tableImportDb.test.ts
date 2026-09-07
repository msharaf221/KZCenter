/**
 * اختبارات الربط الكامل عند الاستيراد — src/lib/tableImportDb.ts
 *
 * السيناريو: المستخدم بيرفع داتا المجاميع مربوطة بالمدرسين، والمطلوب إن النظام
 * يربطها بالكورسات والمواد والأسعار لوحده، وكل طالب يتسجّل بالسعر الصح
 * ويتعملّه أقساط — من غير تكرار ومن غير كيانات معلّقة.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbAdd, dbGetAll, dbGetById, dbClearStore, generateId,
  type Course, type Group, type Teacher, type Student,
  type Enrollment, type Installment,
} from '../lib/db';
import { parseTable } from '../lib/tableImport';
import { importTableIntoDb, linkOrphans, normalizePhone } from '../lib/tableImportDb';
import { setSettingsCache, DEFAULT_SETTINGS_VALUES } from '../lib/settings';

const HEADERS = ['اسم الطالب', 'تليفون', 'المدرس', 'المجموعة', 'المادة', 'السعر'];

async function clearAll() {
  for (const store of ['courses', 'groups', 'teachers', 'students', 'installments', 'enrollments', 'payments'] as const) {
    await dbClearStore(store);
  }
}

/** يبني سجلات من صفوف خام (نفس مسار الواجهة) */
function records(rows: string[][]) {
  return parseTable(HEADERS, rows).records;
}

beforeEach(async () => {
  await clearAll();
  setSettingsCache({ ...DEFAULT_SETTINGS_VALUES });
});

describe('normalizePhone', () => {
  it('بيوحّد كل صيغ الرقم المصري', () => {
    expect(normalizePhone('01012345678')).toBe('01012345678');
    expect(normalizePhone('201012345678')).toBe('01012345678');
    expect(normalizePhone('1012345678')).toBe('01012345678');
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone('')).toBe('');
  });
});

describe('importTableIntoDb — الربط الكامل', () => {
  it('بيبني الشجرة كاملة: مادة ← كورس ← مجموعة ← مدرس ← طالب', async () => {
    const report = await importTableIntoDb(records([
      ['أحمد محمد', '01011111111', 'ولاء', 'ماث 1 السبت من 4/5', 'ماث', ''],
      ['سارة علي', '01022222222', 'ولاء', 'ماث 1 السبت من 4/5', 'ماث', ''],
      ['محمود حسن', '01033333333', 'هاجر', 'قرآن 1 الأحد من 5/6', 'قرآن', ''],
    ]));

    expect(report.teachersCreated).toBe(2);
    expect(report.groupsCreated).toBe(2);
    expect(report.studentsCreated).toBe(3);
    expect(report.enrollmentsCreated).toBe(3);
    expect(report.errors).toEqual([]);

    // الكورسات اتعملت بالمادة والسعر الصح
    const courses = await dbGetAll<Course>('courses');
    const math = courses.find(c => c.subjectId === 'math')!;
    const quran = courses.find(c => c.subjectId === 'quran')!;
    expect(math.price).toBe(250);
    expect(quran.price).toBe(200);

    // المجموعات مربوطة بالكورس + المدرس + المادة + الجدول
    const groups = await dbGetAll<Group>('groups');
    const teachers = await dbGetAll<Teacher>('teachers');
    const mathGroup = groups.find(g => g.subjectId === 'math')!;
    expect(mathGroup.courseId).toBe(math.id);
    expect(teachers.some(t => t.id === mathGroup.teacherId && t.name === 'ولاء')).toBe(true);
    expect(mathGroup.schedule[0].days).toEqual(['saturday']);
    expect(mathGroup.schedule[0].startTime).toBe('16:00');
    expect(mathGroup.studentIds).toHaveLength(2);

    // كل تسجيل اتعملّه أقساط بالسعر الصح
    const installments = await dbGetAll<Installment>('installments');
    expect(installments).toHaveLength(3);
    const mathInstallments = installments.filter(i => i.groupId === mathGroup.id);
    expect(mathInstallments.every(i => i.amount === 250)).toBe(true);
  });

  it('المدرس بياخد كل مواده من مجموعاته', async () => {
    await importTableIntoDb(records([
      ['أحمد', '01011111111', 'ولاء', 'ماث 1', 'ماث', ''],
      ['سارة', '01022222222', 'ولاء', 'إنجليزي 2', 'english', ''],
      ['منى', '01033333333', 'ولاء', 'قرآن 3', 'قرآن', ''],
    ]));

    const teachers = await dbGetAll<Teacher>('teachers');
    expect(teachers).toHaveLength(1);
    expect([...(teachers[0].subjectIds || [])].sort()).toEqual(['english', 'math', 'quran']);
  });

  it('الطالب في أكتر من مجموعة = ملف واحد وتسجيلين', async () => {
    await importTableIntoDb(records([
      ['أحمد محمد', '01011111111', 'ولاء', 'ماث 1', 'ماث', ''],
      ['أحمد محمد', '01011111111', 'هاجر', 'قرآن 1', 'قرآن', ''],
    ]));

    const students = await dbGetAll<Student>('students');
    expect(students).toHaveLength(1);

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    expect(enrollments).toHaveLength(2);
    expect(new Set(enrollments.map(e => e.groupId)).size).toBe(2);

    // مستحقاته = مجموع المادتين
    const installments = await dbGetAll<Installment>('installments');
    expect(installments.reduce((s, i) => s + i.amount, 0)).toBe(450);   // 250 + 200
  });

  it('السعر المختلف في الصف بيتسجّل كسعر خاص مش بيغيّر الكورس', async () => {
    const report = await importTableIntoDb(records([
      ['أحمد', '01011111111', 'ولاء', 'ماث 1', 'ماث', '250'],
      ['سارة', '01022222222', 'ولاء', 'ماث 1', 'ماث', '150'],   // سعر خاص (أخوات مثلاً)
    ]));

    expect(report.priceOverrides).toBe(1);

    const course = (await dbGetAll<Course>('courses')).find(c => c.subjectId === 'math')!;
    expect(course.price).toBe(250);   // سعر الكورس ما اتغيّرش

    const students = await dbGetAll<Student>('students');
    const sara = students.find(s => s.name === 'سارة')!;
    const saraInstallments = (await dbGetAll<Installment>('installments'))
      .filter(i => i.studentId === sara.id);
    expect(saraInstallments[0].amount).toBe(150);

    const ahmed = students.find(s => s.name === 'أحمد')!;
    const ahmedInstallments = (await dbGetAll<Installment>('installments'))
      .filter(i => i.studentId === ahmed.id);
    expect(ahmedInstallments[0].amount).toBe(250);
  });

  it('بيولّد اسم مجموعة لو الداتا مفيهاش عمود مجموعة', async () => {
    await importTableIntoDb(parseTable(
      ['اسم الطالب', 'المدرس', 'المادة', 'اليوم', 'الميعاد'],
      [['أحمد', 'ولاء', 'ماث', 'السبت', '4/5']],
    ).records);

    const groups = await dbGetAll<Group>('groups');
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toContain('ماث');
    expect(groups[0].name).toContain('ولاء');
    expect(groups[0].subjectId).toBe('math');
  });

  it('idempotent — الاستيراد التاني ما يكررش حاجة', async () => {
    const rows = [
      ['أحمد', '01011111111', 'ولاء', 'ماث 1', 'ماث', ''],
      ['سارة', '01022222222', 'ولاء', 'ماث 1', 'ماث', ''],
    ];
    await importTableIntoDb(records(rows));
    const second = await importTableIntoDb(records(rows));

    expect(second.teachersCreated).toBe(0);
    expect(second.groupsCreated).toBe(0);
    expect(second.studentsCreated).toBe(0);
    expect(second.enrollmentsCreated).toBe(0);

    expect(await dbGetAll<Student>('students')).toHaveLength(2);
    expect(await dbGetAll<Group>('groups')).toHaveLength(1);
    expect(await dbGetAll<Installment>('installments')).toHaveLength(2);
  });

  it('بيتطابق مع الطلاب والمدرسين الموجودين بالتليفون', async () => {
    const existing: Student = {
      id: generateId(), name: 'أحمد محمد', age: 10, gender: 'male',
      phone: '01011111111', parentPhone: '01011111111',
      status: 'active', totalPaid: 0, enrolledGroups: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await dbAdd('students', existing);

    // نفس الرقم بس الاسم مكتوب بشكل مختلف
    const report = await importTableIntoDb(records([
      ['احمد محمد عبد الله', '01011111111', 'ولاء', 'ماث 1', 'ماث', ''],
    ]));

    expect(report.studentsCreated).toBe(0);
    expect(report.studentsMatchedByPhone).toBe(1);
    expect(await dbGetAll<Student>('students')).toHaveLength(1);
  });

  it('بيربط بالكورس الموجود بدل ما يعمل واحد جديد', async () => {
    const course: Course = {
      id: generateId(), name: 'الرياضيات إنجليزي', category: 'رياضيات',
      subjectId: 'math', price: 275, durationMonths: 1,
      icon: '🔢', color: '#8b5cf6', levels: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await dbAdd('courses', course);

    const report = await importTableIntoDb(records([
      ['أحمد', '01011111111', 'ولاء', 'ماث 1', 'ماث', ''],
    ]));

    expect(report.coursesCreated).toBe(0);
    expect(report.coursesExisting).toBe(1);
    const groups = await dbGetAll<Group>('groups');
    expect(groups[0].courseId).toBe(course.id);
    // السعر اليدوي للكورس محترم
    const installments = await dbGetAll<Installment>('installments');
    expect(installments[0].amount).toBe(275);
  });

  it('السجل المجهول المادة بياخد السعر الافتراضي وبيتسجّل', async () => {
    const report = await importTableIntoDb(records([
      ['أحمد', '01011111111', 'ولاء', 'مجموعة 4', '', ''],
    ]), { fallbackPrice: 180 });

    expect(report.rowsWithoutSubject).toBe(1);
    const courses = await dbGetAll<Course>('courses');
    expect(courses[0].price).toBe(180);
    expect(courses[0].subjectId).toBeUndefined();
    expect(report.enrollmentsCreated).toBe(1);
  });

  it('بيحترم أسعار المواد المخصّصة', async () => {
    await importTableIntoDb(records([
      ['أحمد', '01011111111', 'ولاء', 'ماث 1', 'ماث', ''],
    ]), { subjectPrices: { math: 300 } });

    const course = (await dbGetAll<Course>('courses')).find(c => c.subjectId === 'math')!;
    expect(course.price).toBe(300);
    expect((await dbGetAll<Installment>('installments'))[0].amount).toBe(300);
  });

  it('الداتا من غير عمود مدرس بتتربط بمدرس «غير محدد»', async () => {
    const report = await importTableIntoDb(parseTable(
      ['اسم الطالب', 'المادة'],
      [['أحمد', 'ماث']],
    ).records);

    expect(report.teachersCreated).toBe(1);
    const teachers = await dbGetAll<Teacher>('teachers');
    expect(teachers[0].name).toBe('غير محدد');
    // ومع ذلك التسجيل تمّ والربط سليم
    expect(report.enrollmentsCreated).toBe(1);
  });
});

describe('linkOrphans', () => {
  it('بيربط الكورسات والمجموعات المعلّقة بموادها', async () => {
    const teacher: Teacher = {
      id: generateId(), name: 'ولاء', specialization: 'غير محدد', phone: '01000000000',
      salary: 0, status: 'active', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
    await dbAdd('teachers', teacher);
    const course: Course = {
      id: generateId(), name: 'grammer', category: 'مجموعات', price: 100, durationMonths: 1,
      icon: '📘', color: '#6366f1', levels: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
    await dbAdd('courses', course);
    const group: Group = {
      id: generateId(), name: 'grammer 1', courseId: course.id, teacherId: teacher.id,
      schedule: [], maxStudents: 20, status: 'open', studentIds: [],
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    };
    await dbAdd('groups', group);

    const result = await linkOrphans();

    expect(result.courses).toBe(1);
    expect(result.groups).toBe(1);
    expect((await dbGetById<Course>('courses', course.id))!.subjectId).toBe('english');
    expect((await dbGetById<Group>('groups', group.id))!.subjectId).toBe('english');
  });
});
