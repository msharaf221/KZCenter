/**
 * اختبارات ربط المواد وتطبيق الأسعار — src/lib/subjectSync.ts
 *
 * السيناريو الحقيقي: بيانات مستوردة من الشيت (كورسات بأسماء حرة وسعر صفر،
 * مجموعات مربوطة بمدرسين، وأقساط متولّدة). المطلوب إن «ظبط المواد» يربط كل
 * حاجة بمادتها ويحط السعر الصح **من غير** ما يلخبط الفلوس المدفوعة.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  dbAdd, dbGetAll, dbGetById, dbClearStore, generateId,
  type Course, type Group, type Teacher, type Student, type Installment, type Enrollment,
} from '../lib/db';
import { syncSubjects, guessCourseSubject, getSubjectPrices } from '../lib/subjectSync';
import { setSettingsCache } from '../lib/settings';
import { DEFAULT_SETTINGS_VALUES } from '../lib/settings';

const NOW = '2026-09-01T10:00:00.000Z';

async function clearAll() {
  for (const store of ['courses', 'groups', 'teachers', 'students', 'installments', 'enrollments', 'payments'] as const) {
    await dbClearStore(store);
  }
}

async function seedTeacher(name: string, specialization = 'غير محدد'): Promise<Teacher> {
  const t: Teacher = {
    id: generateId(), name, specialization, phone: '01000000000',
    salary: 0, status: 'active', createdAt: NOW, updatedAt: NOW,
  };
  await dbAdd('teachers', t);
  return t;
}

async function seedCourse(o: Partial<Course> & { name: string }): Promise<Course> {
  const c: Course = {
    id: generateId(), name: o.name, category: o.category ?? 'مجموعات',
    description: o.description, subjectId: o.subjectId,
    price: o.price ?? 0, durationMonths: 1,
    icon: '📘', color: '#6366f1', levels: [],
    createdAt: NOW, updatedAt: NOW,
  };
  await dbAdd('courses', c);
  return c;
}

async function seedGroup(o: { name: string; courseId: string; teacherId: string }): Promise<Group> {
  const g: Group = {
    id: generateId(), name: o.name, courseId: o.courseId, teacherId: o.teacherId,
    schedule: [{ days: ['saturday'], startTime: '16:00', endTime: '17:00' }],
    maxStudents: 20, status: 'open', studentIds: [],
    createdAt: NOW, updatedAt: NOW,
  };
  await dbAdd('groups', g);
  return g;
}

async function seedStudent(name: string): Promise<Student> {
  const s: Student = {
    id: generateId(), name, age: 10, gender: 'male', phone: '01111111111', parentPhone: '01111111111',
    status: 'active', totalPaid: 0, enrolledGroups: [],
    createdAt: NOW, updatedAt: NOW,
  };
  await dbAdd('students', s);
  return s;
}

async function seedInstallment(o: Partial<Installment> & { studentId: string; groupId: string; amount: number }): Promise<Installment> {
  const i: Installment = {
    id: generateId(), studentId: o.studentId, groupId: o.groupId,
    enrollmentId: o.enrollmentId,
    periodIndex: 1, periodLabel: 'شهر سبتمبر 2026',
    amount: o.amount, paidAmount: o.paidAmount ?? 0,
    dueDate: '2026-09-20', status: o.status ?? 'pending',
    createdAt: NOW, updatedAt: NOW,
  };
  await dbAdd('installments', i);
  return i;
}

beforeEach(async () => {
  await clearAll();
  setSettingsCache({ ...DEFAULT_SETTINGS_VALUES });
});

describe('getSubjectPrices', () => {
  it('بترجّع الأسعار الافتراضية من غير إعدادات', async () => {
    expect(await getSubjectPrices()).toEqual({
      english: 250, math: 250, hesab: 200, arabic: 200, quran: 200,
    });
  });

  it('بتحترم أسعار المستخدم من الإعدادات', async () => {
    setSettingsCache({ ...DEFAULT_SETTINGS_VALUES, subjectPrices: { english: 300 } });
    const prices = await getSubjectPrices();
    expect(prices.english).toBe(300);
    expect(prices.quran).toBe(200);
  });
});

describe('guessCourseSubject', () => {
  it('بيطابق من اسم الكورس', () => {
    expect(guessCourseSubject({ name: 'grammer', description: '', category: 'مجموعات' })).toBe('english');
  });

  it('بيرجع لأسماء المجموعات لو الاسم مش واضح', () => {
    expect(guessCourseSubject(
      { name: 'مجموعات أ', description: '', category: 'مجموعات' },
      [{ name: 'تحفيظ 1' }],
    )).toBe('quran');
  });

  it('بيرجع لتخصص المدرس كآخر حاجة', () => {
    expect(guessCourseSubject(
      { name: 'مجموعة 4', description: '', category: 'مجموعات' },
      [{ name: 'مجموعة 4 السبت' }],
      ['حساب'],
    )).toBe('hesab');
  });

  it('بيرجّع null لو مفيش أي دلالة', () => {
    expect(guessCourseSubject({ name: 'مجموعة 4', description: '', category: 'مجموعات' })).toBeNull();
  });
});

describe('syncSubjects — الربط والتسعير', () => {
  it('بيربط الكورسات المستوردة بموادها ويحط السعر الصح', async () => {
    const teacher = await seedTeacher('ولاء');
    const eng = await seedCourse({ name: 's.r', price: 0 });
    const quran = await seedCourse({ name: 'تحفيظ', price: 0 });
    const math = await seedCourse({ name: 'Math', price: 0 });
    const hesab = await seedCourse({ name: 'حساب', price: 0 });
    for (const c of [eng, quran, math, hesab]) {
      await seedGroup({ name: `${c.name} السبت`, courseId: c.id, teacherId: teacher.id });
    }

    const report = await syncSubjects();

    const courses = await dbGetAll<Course>('courses');
    const byName = new Map(courses.map(c => [c.name, c]));
    expect(byName.get('s.r')!.subjectId).toBe('english');
    expect(byName.get('s.r')!.price).toBe(250);
    expect(byName.get('تحفيظ')!.price).toBe(200);
    expect(byName.get('Math')!.subjectId).toBe('math');
    expect(byName.get('Math')!.price).toBe(250);
    expect(byName.get('حساب')!.subjectId).toBe('hesab');
    expect(byName.get('حساب')!.price).toBe(200);
    expect(report.coursesLinked).toBe(4);
    expect(report.coursesRepriced).toBe(4);
  });

  it('بيعمل كورس للمواد اللي مفيش ليها كورس', async () => {
    await syncSubjects();
    const courses = await dbGetAll<Course>('courses');
    expect(courses).toHaveLength(5);
    expect(courses.map(c => c.subjectId).sort()).toEqual(
      ['arabic', 'english', 'hesab', 'math', 'quran']
    );
    // كل كورس متولّد بياخد سعر مادته
    expect(courses.find(c => c.subjectId === 'english')!.price).toBe(250);
    expect(courses.find(c => c.subjectId === 'arabic')!.price).toBe(200);
  });

  it('بيورّث المادة للمجموعات ويجمّع مواد المدرسين', async () => {
    const teacher = await seedTeacher('إيمان');
    const eng = await seedCourse({ name: 'English', price: 0 });
    const quran = await seedCourse({ name: 'قرآن', price: 0 });
    await seedGroup({ name: 'level 3', courseId: eng.id, teacherId: teacher.id });
    await seedGroup({ name: 'تحفيظ 1', courseId: quran.id, teacherId: teacher.id });

    const report = await syncSubjects();

    const groups = await dbGetAll<Group>('groups');
    expect(groups.map(g => g.subjectId).sort()).toEqual(['english', 'quran']);
    expect(report.groupsLinked).toBe(2);

    const updated = await dbGetById<Teacher>('teachers', teacher.id);
    expect([...(updated!.subjectIds || [])].sort()).toEqual(['english', 'quran']);
    // التخصص «غير محدد» بيتملي من المواد
    expect(updated!.specialization).toContain('إنجليزي');
    expect(report.teachersLinked).toBe(1);
  });

  it('idempotent — التشغيل تاني ما بيغيّرش حاجة', async () => {
    const teacher = await seedTeacher('ولاء');
    const eng = await seedCourse({ name: 'grammer', price: 0 });
    await seedGroup({ name: 'grammer 1', courseId: eng.id, teacherId: teacher.id });

    await syncSubjects();
    const second = await syncSubjects();

    expect(second.coursesCreated).toBe(0);
    expect(second.coursesLinked).toBe(0);
    expect(second.coursesRepriced).toBe(0);
    expect(second.groupsLinked).toBe(0);
    expect(second.teachersLinked).toBe(0);
  });

  it('بيسجّل الكورسات اللي مش واضح مادتها بدل ما يخمّن', async () => {
    const teacher = await seedTeacher('محمد');
    const c = await seedCourse({ name: 'مجموعة 4', price: 130 });
    await seedGroup({ name: 'مجموعة 4 السبت', courseId: c.id, teacherId: teacher.id });

    const report = await syncSubjects();

    expect(report.coursesUnmatched).toContain('مجموعة 4');
    const after = await dbGetById<Course>('courses', c.id);
    expect(after!.subjectId).toBeUndefined();
    expect(after!.price).toBe(130);   // السعر اليدوي ما اتلمسش
  });

  it('بيحترم أسعار المستخدم من الإعدادات', async () => {
    setSettingsCache({ ...DEFAULT_SETTINGS_VALUES, subjectPrices: { quran: 240 } });
    const teacher = await seedTeacher('حفصة');
    const c = await seedCourse({ name: 'قرآن', price: 0 });
    await seedGroup({ name: 'تحفيظ 1', courseId: c.id, teacherId: teacher.id });

    await syncSubjects();

    expect((await dbGetById<Course>('courses', c.id))!.price).toBe(240);
  });
});

describe('syncSubjects — أثر الأسعار على الأقساط', () => {
  it('بيحدّث الأقساط اللي لسه مدفعش فيها حاجة بس', async () => {
    const teacher = await seedTeacher('ولاء');
    const course = await seedCourse({ name: 'English', price: 0 });
    const group = await seedGroup({ name: 'level 1', courseId: course.id, teacherId: teacher.id });
    const student = await seedStudent('أحمد');

    const untouched = await seedInstallment({ studentId: student.id, groupId: group.id, amount: 100 });
    const partiallyPaid = await seedInstallment({ studentId: student.id, groupId: group.id, amount: 100, paidAmount: 50, status: 'partial' });
    const fullyPaid = await seedInstallment({ studentId: student.id, groupId: group.id, amount: 100, paidAmount: 100, status: 'paid' });

    const report = await syncSubjects();

    const all = await dbGetAll<Installment>('installments');
    const byId = new Map(all.map(i => [i.id, i]));
    expect(byId.get(untouched.id)!.amount).toBe(250);        // اتحدّث للسعر الجديد
    expect(byId.get(partiallyPaid.id)!.amount).toBe(100);    // مدفوع جزئياً → ما اتغيّرش
    expect(byId.get(fullyPaid.id)!.amount).toBe(100);        // مدفوع → ما اتغيّرش
    expect(report.installmentsUpdated).toBe(1);
    expect(report.studentsRecalculated).toBe(1);
  });

  it('ما بيلمسش أقساط تسجيل ليه سعر خاص أو خصم', async () => {
    const teacher = await seedTeacher('ولاء');
    const course = await seedCourse({ name: 'English', price: 0 });
    const group = await seedGroup({ name: 'level 1', courseId: course.id, teacherId: teacher.id });
    const student = await seedStudent('سارة');

    const enrollment: Enrollment = {
      id: generateId(), studentId: student.id, groupId: group.id,
      status: 'active', enrolledAt: NOW, priceOverride: 150,
      createdAt: NOW, updatedAt: NOW,
    };
    await dbAdd('enrollments', enrollment);
    const inst = await seedInstallment({
      studentId: student.id, groupId: group.id, amount: 150, enrollmentId: enrollment.id,
    });

    const report = await syncSubjects();

    expect((await dbGetById<Installment>('installments', inst.id))!.amount).toBe(150);
    expect(report.installmentsUpdated).toBe(0);
  });

  it('بيقدر يتقفل تحديث الأقساط بالخيار', async () => {
    const teacher = await seedTeacher('ولاء');
    const course = await seedCourse({ name: 'English', price: 0 });
    const group = await seedGroup({ name: 'level 1', courseId: course.id, teacherId: teacher.id });
    const student = await seedStudent('منة');
    const inst = await seedInstallment({ studentId: student.id, groupId: group.id, amount: 100 });

    await syncSubjects({ updateUnpaidInstallments: false });

    expect((await dbGetById<Installment>('installments', inst.id))!.amount).toBe(100);
    expect((await dbGetById<Course>('courses', course.id))!.price).toBe(250);
  });
});
