/**
 * اختبارات فحص جودة الداتا — src/lib/dataQuality.ts
 *
 * الفكرة: الاستيراد ما يقولش «تمام» غير لما كل حاجة مترابطة فعلاً.
 * الفحص لازم يكتشف: مجموعة من غير مدرس/كورس/مادة، كورس بسعر صفر،
 * طالب من غير مجموعة، تسجيل من غير أقساط — والإصلاح التلقائي يصلّح اللي ينفع.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbAdd, dbGetById, dbClearStore, generateId,
  type Course, type Group, type Teacher, type Student, type Enrollment,
} from '../lib/db';
import { auditData, autoFix, type IssueCode } from '../lib/dataQuality';
import { importTableIntoDb } from '../lib/tableImportDb';
import { parseTable } from '../lib/tableImport';
import { setSettingsCache, DEFAULT_SETTINGS_VALUES } from '../lib/settings';

const T0 = '2026-01-01T00:00:00.000Z';

async function clearAll() {
  for (const store of ['courses', 'groups', 'teachers', 'students', 'installments', 'enrollments', 'payments'] as const) {
    await dbClearStore(store);
  }
}

async function seedTeacher(o: Partial<Teacher> = {}): Promise<Teacher> {
  const t: Teacher = {
    id: generateId(), name: o.name || 'ولاء', specialization: o.specialization || 'غير محدد',
    subjectIds: o.subjectIds, phone: '01000000000', salary: 0, status: 'active',
    createdAt: T0, updatedAt: T0, ...o,
  };
  await dbAdd('teachers', t);
  return t;
}

async function seedCourse(o: Partial<Course> & { name: string }): Promise<Course> {
  const c: Course = {
    id: generateId(), name: o.name, category: o.category || 'مجموعات',
    subjectId: o.subjectId, price: o.price ?? 0, durationMonths: 1,
    icon: '📘', color: '#6366f1', levels: [], createdAt: T0, updatedAt: T0,
  };
  await dbAdd('courses', c);
  return c;
}

async function seedGroup(o: Partial<Group> & { name: string; courseId: string; teacherId: string }): Promise<Group> {
  const g: Group = {
    id: generateId(), name: o.name, courseId: o.courseId, teacherId: o.teacherId,
    subjectId: o.subjectId,
    schedule: o.schedule ?? [{ days: ['saturday'], startTime: '16:00', endTime: '17:00' }],
    maxStudents: 20, status: 'open', studentIds: o.studentIds ?? [],
    createdAt: T0, updatedAt: T0,
  };
  await dbAdd('groups', g);
  return g;
}

async function seedStudent(name: string, phone = '01011111111'): Promise<Student> {
  const s: Student = {
    id: generateId(), name, age: 10, gender: 'male', phone, parentPhone: phone,
    status: 'active', totalPaid: 0, enrolledGroups: [], createdAt: T0, updatedAt: T0,
  };
  await dbAdd('students', s);
  return s;
}

/** هل التقرير فيه المشكلة دي؟ */
const has = (issues: { code: IssueCode }[], code: IssueCode) => issues.some(i => i.code === code);

beforeEach(async () => {
  await clearAll();
  setSettingsCache({ ...DEFAULT_SETTINGS_VALUES });
});

describe('auditData — اكتشاف المشاكل', () => {
  it('داتا فاضية = نتيجة كاملة من غير مشاكل', async () => {
    const report = await auditData();
    expect(report.issues).toEqual([]);
    expect(report.score).toBe(100);
  });

  it('بيكتشف المجموعة من غير مدرس أو كورس', async () => {
    const teacher = await seedTeacher();
    const course = await seedCourse({ name: 'ماث', subjectId: 'math', price: 250 });
    await seedGroup({ name: 'يتيمة', courseId: 'مش-موجود', teacherId: 'مش-موجود' });
    await seedGroup({ name: 'سليمة', courseId: course.id, teacherId: teacher.id, subjectId: 'math' });

    const report = await auditData();
    expect(has(report.issues, 'group_without_teacher')).toBe(true);
    expect(has(report.issues, 'group_without_course')).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  it('بيكتشف الكورس من غير مادة والسعر بصفر', async () => {
    await seedCourse({ name: 'مجموعة 4', price: 0 });

    const report = await auditData();
    expect(has(report.issues, 'course_without_subject')).toBe(true);
    expect(has(report.issues, 'course_zero_price')).toBe(true);
  });

  it('بيكتشف المجموعة من غير مادة ومن غير جدول', async () => {
    const teacher = await seedTeacher();
    const course = await seedCourse({ name: 'مجموعة 4', price: 100 });
    await seedGroup({ name: 'بدون جدول', courseId: course.id, teacherId: teacher.id, schedule: [] });

    const report = await auditData();
    expect(has(report.issues, 'group_without_subject')).toBe(true);
    expect(has(report.issues, 'group_without_schedule')).toBe(true);
  });

  it('بيكتشف الطالب المش مسجّل في أي مجموعة', async () => {
    await seedStudent('أحمد');

    const report = await auditData();
    const issue = report.issues.find(i => i.code === 'student_without_group')!;
    expect(issue.entities).toContain('أحمد');
  });

  it('بيكتشف التليفون المؤقت (placeholder)', async () => {
    await seedStudent('سارة', '01000000001');

    const report = await auditData();
    expect(has(report.issues, 'student_placeholder_phone')).toBe(true);
  });

  it('بيكتشف التسجيل من غير أقساط', async () => {
    const teacher = await seedTeacher();
    const course = await seedCourse({ name: 'ماث', subjectId: 'math', price: 250 });
    const group = await seedGroup({ name: 'ماث 1', courseId: course.id, teacherId: teacher.id, subjectId: 'math' });
    const student = await seedStudent('أحمد');
    const enrollment: Enrollment = {
      id: generateId(), studentId: student.id, groupId: group.id,
      status: 'active', enrolledAt: T0, createdAt: T0, updatedAt: T0,
    };
    await dbAdd('enrollments', enrollment);

    const report = await auditData();
    expect(has(report.issues, 'enrollment_without_installments')).toBe(true);
  });

  it('بيكتشف المدرس من غير مواد', async () => {
    await seedTeacher({ name: 'هاجر' });

    const report = await auditData();
    const issue = report.issues.find(i => i.code === 'teacher_without_subjects')!;
    expect(issue.entities).toContain('هاجر');
    expect(issue.autoFixable).toBe(true);
  });

  it('النتيجة بتقل مع خطورة المشاكل', async () => {
    await seedCourse({ name: 'مجموعة 4', price: 0 });   // error + warning
    const withIssues = await auditData();
    expect(withIssues.score).toBeLessThanOrEqual(86);
  });
});

describe('auditData — الملخص والتوزيع', () => {
  it('بيحسب نسبة الترابط والتوزيع على المواد', async () => {
    await importTableIntoDb(parseTable(
      ['اسم الطالب', 'المدرس', 'المجموعة', 'المادة'],
      [
        ['أحمد', 'ولاء', 'ماث 1', 'ماث'],
        ['سارة', 'ولاء', 'ماث 1', 'ماث'],
        ['منى', 'هاجر', 'قرآن 1', 'قرآن'],
      ],
    ).records);

    const report = await auditData();
    expect(report.totals.students).toBe(3);
    expect(report.totals.teachers).toBe(2);
    expect(report.totals.groups).toBe(2);
    expect(report.totals.enrollments).toBe(3);
    expect(report.totals.subjectCoverage).toBe(100);

    const math = report.bySubject.find(s => s.id === 'math')!;
    expect(math.groups).toBe(1);
    expect(math.students).toBe(2);
    expect(math.price).toBe(250);

    const quran = report.bySubject.find(s => s.id === 'quran')!;
    expect(quran.students).toBe(1);
    expect(quran.price).toBe(200);
  });

  it('استيراد نضيف = مفيش أخطاء خطيرة', async () => {
    await importTableIntoDb(parseTable(
      ['اسم الطالب', 'تليفون', 'المدرس', 'المجموعة', 'المادة'],
      [['أحمد', '01011111111', 'ولاء', 'ماث 1 السبت من 4/5', 'ماث']],
    ).records);

    const report = await auditData();
    expect(report.issues.filter(i => i.severity === 'error')).toEqual([]);
  });
});

describe('autoFix — الإصلاح التلقائي', () => {
  it('بيربط الكورس بمادته ويحط سعرها', async () => {
    const course = await seedCourse({ name: 'grammer', price: 0 });

    const fix = await autoFix();

    expect(fix.coursesLinked).toBe(1);
    expect(fix.coursesRepriced).toBe(1);
    const after = await dbGetById<Course>('courses', course.id);
    expect(after!.subjectId).toBe('english');
    expect(after!.price).toBe(250);
  });

  it('بيورّث المادة للمجموعة ويملّي مواد المدرس', async () => {
    const teacher = await seedTeacher({ name: 'ولاء' });
    const course = await seedCourse({ name: 'قرآن', price: 0 });
    const group = await seedGroup({ name: 'تحفيظ 1', courseId: course.id, teacherId: teacher.id });

    const fix = await autoFix();

    expect(fix.groupsLinked).toBe(1);
    expect(fix.teachersLinked).toBe(1);
    expect((await dbGetById<Group>('groups', group.id))!.subjectId).toBe('quran');
    const after = await dbGetById<Teacher>('teachers', teacher.id);
    expect(after!.subjectIds).toEqual(['quran']);
    expect(after!.specialization).toContain('قرآن');
  });

  it('بيحترم الأسعار المخصّصة', async () => {
    const course = await seedCourse({ name: 'ماث', price: 0 });
    await autoFix({ math: 320 });
    expect((await dbGetById<Course>('courses', course.id))!.price).toBe(320);
  });

  it('ما بيلمسش السعر اليدوي الموجود', async () => {
    const course = await seedCourse({ name: 'ماث', subjectId: 'math', price: 275 });
    const fix = await autoFix();
    expect(fix.coursesRepriced).toBe(0);
    expect((await dbGetById<Course>('courses', course.id))!.price).toBe(275);
  });

  it('بيرفع نتيجة الجودة بعد الإصلاح', async () => {
    const teacher = await seedTeacher({ name: 'ولاء' });
    const course = await seedCourse({ name: 'grammer', price: 0 });
    await seedGroup({ name: 'grammer 1', courseId: course.id, teacherId: teacher.id });

    const before = await auditData();
    await autoFix();
    const after = await auditData();

    expect(after.score).toBeGreaterThan(before.score);
    expect(has(after.issues, 'course_without_subject')).toBe(false);
    expect(has(after.issues, 'course_zero_price')).toBe(false);
    expect(has(after.issues, 'group_without_subject')).toBe(false);
  });

  it('idempotent — الإصلاح التاني ما بيعملش حاجة', async () => {
    const teacher = await seedTeacher();
    const course = await seedCourse({ name: 'ماث', price: 0 });
    await seedGroup({ name: 'ماث 1', courseId: course.id, teacherId: teacher.id });

    await autoFix();
    const second = await autoFix();

    expect(second.coursesLinked).toBe(0);
    expect(second.coursesRepriced).toBe(0);
    expect(second.groupsLinked).toBe(0);
    expect(second.teachersLinked).toBe(0);
  });
});
