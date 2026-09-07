/**
 * ربط المواد بالكاتالوج وتطبيق الأسعار
 * ==========================================
 *
 * الوظيفة: تاخد البيانات الموجودة (كورسات + مجموعات + مدرسين اللي اتعملوا
 * من الاستيراد أو يدوي) وتظبطها على كاتالوج المواد:
 *
 *  1) كل كورس بيتربط بمادته (`subjectId`) بالمطابقة على اسمه/وصفه/تصنيفه،
 *     ولو مش واضح بنجرّب أسماء مجموعاته وتخصص مدرسها.
 *  2) سعر الكورس بيتحدّث لسعر المادة (english 250 · math 250 · hesab 200 ·
 *     arabic 200 · quran 200 — أو اللي المستخدم عدّله في الإعدادات).
 *  3) كل مجموعة بتورث `subjectId` من كورسها، وكل مدرس بياخد قائمة موادّه
 *     من مواد مجموعاته.
 *  4) الأقساط **اللي لسه مدفعش فيها حاجة** بتتحدّث بالسعر الجديد (الأقساط
 *     المدفوعة كلياً/جزئياً بتفضل زي ما هي عشان ما نلخبطش المحاسبة)،
 *     وبعدين أرصدة الطلاب بيتعاد حسابها.
 *
 * الدوال كلها idempotent: تشغيلها أكتر من مرة ما بيغيّرش حاجة زيادة.
 */
import dayjs from 'dayjs';
import {
  dbGetAll, dbPut, dbAdd, generateId,
  type Course, type Group, type Teacher, type Installment, type Enrollment,
  recalculateStudentTotalPaid,
} from './db';
import { getSettings } from './settings';
import {
  SUBJECTS, matchSubjectId, subjectPrice, getSubject,
  type SubjectId, type SubjectPrices,
} from './subjects';
import { installmentState } from './billing';

export interface SubjectSyncOptions {
  /** إنشاء كورس لكل مادة ناقصة (عشان تقدر تفتح مجموعات عليها فوراً) */
  createMissingCourses?: boolean;
  /** تحديث أسعار الكورسات المربوطة بمواد */
  applyPrices?: boolean;
  /** تحديث الأقساط غير المدفوعة بالسعر الجديد */
  updateUnpaidInstallments?: boolean;
  /** أسعار مخصّصة (لو مش متمررة بتتقرا من الإعدادات) */
  prices?: SubjectPrices | null;
}

export interface SubjectSyncReport {
  coursesCreated: number;
  coursesLinked: number;
  coursesRepriced: number;
  /** كورسات مش واضح مادتها — محتاجة ربط يدوي */
  coursesUnmatched: string[];
  groupsLinked: number;
  teachersLinked: number;
  installmentsUpdated: number;
  studentsRecalculated: number;
  /** تفصيل السعر لكل مادة بعد التطبيق */
  prices: { id: SubjectId; name: string; price: number; courses: number; groups: number }[];
}

const DEFAULT_OPTS: Required<Omit<SubjectSyncOptions, 'prices'>> = {
  createMissingCourses: true,
  applyPrices: true,
  updateUnpaidInstallments: true,
};

/** أسعار المواد الفعلية (إعدادات المستخدم فوق الافتراضي) */
export async function getSubjectPrices(): Promise<Record<SubjectId, number>> {
  let overrides: SubjectPrices | undefined;
  try {
    overrides = (await getSettings()).subjectPrices;
  } catch {
    overrides = undefined;
  }
  return SUBJECTS.reduce((acc, s) => {
    acc[s.id] = subjectPrice(s.id, overrides);
    return acc;
  }, {} as Record<SubjectId, number>);
}

/**
 * تخمين مادة كورس من كل المعلومات المتاحة عنه:
 * اسمه → وصفه → تصنيفه → أسماء مجموعاته → تخصص مدرسيه.
 */
export function guessCourseSubject(
  course: Pick<Course, 'name' | 'description' | 'category'>,
  groups: Pick<Group, 'name'>[] = [],
  teacherSpecializations: string[] = [],
): SubjectId | null {
  return (
    matchSubjectId(course.name)
    ?? matchSubjectId(course.description, course.category)
    ?? matchSubjectId(...groups.map(g => g.name))
    ?? matchSubjectId(...teacherSpecializations)
  );
}

/**
 * تطبيق كاتالوج المواد على البيانات الموجودة.
 * بيرجّع تقرير مفصّل يتعرض للمستخدم.
 */
export async function syncSubjects(options: SubjectSyncOptions = {}): Promise<SubjectSyncReport> {
  const opts = { ...DEFAULT_OPTS, ...options };
  const prices = options.prices
    ? SUBJECTS.reduce((acc, s) => {
        acc[s.id] = subjectPrice(s.id, options.prices);
        return acc;
      }, {} as Record<SubjectId, number>)
    : await getSubjectPrices();

  const report: SubjectSyncReport = {
    coursesCreated: 0,
    coursesLinked: 0,
    coursesRepriced: 0,
    coursesUnmatched: [],
    groupsLinked: 0,
    teachersLinked: 0,
    installmentsUpdated: 0,
    studentsRecalculated: 0,
    prices: [],
  };

  const now = new Date().toISOString();
  const [courses, groups, teachers] = await Promise.all([
    dbGetAll<Course>('courses'),
    dbGetAll<Group>('groups'),
    dbGetAll<Teacher>('teachers'),
  ]);

  const teacherById = new Map(teachers.map(t => [t.id, t]));
  const groupsByCourse = new Map<string, Group[]>();
  for (const g of groups) {
    const list = groupsByCourse.get(g.courseId) || [];
    list.push(g);
    groupsByCourse.set(g.courseId, list);
  }

  // ---------- 1) ربط الكورسات بموادها + السعر ----------
  /** المادة ← الكورسات بتاعتها (بيتستخدم بعدين لاختيار كورس المادة الافتراضي) */
  const coursesBySubject = new Map<SubjectId, Course[]>();
  /** الكورسات اللي سعرها اتغيّر (عشان نحدّث أقساطها) */
  const repricedCourseIds = new Set<string>();

  for (const course of courses) {
    const courseGroups = groupsByCourse.get(course.id) || [];
    const specializations = [...new Set(
      courseGroups.map(g => teacherById.get(g.teacherId)?.specialization || '')
    )];
    const subjectId = course.subjectId
      ?? guessCourseSubject(course, courseGroups, specializations);

    if (!subjectId) {
      report.coursesUnmatched.push(course.name);
      continue;
    }

    const subject = getSubject(subjectId)!;
    const price = prices[subjectId];
    const patch: Partial<Course> = {};

    if (course.subjectId !== subjectId) {
      patch.subjectId = subjectId;
      report.coursesLinked++;
    }
    if (opts.applyPrices && course.price !== price) {
      patch.price = price;
      report.coursesRepriced++;
      repricedCourseIds.add(course.id);
    }
    // تصنيف/أيقونة الكورسات المتولّدة تلقائياً («مجموعات») بتتظبط على المادة
    if (!course.category || course.category === 'مجموعات' || course.category === 'مجموعات مدرس') {
      patch.category = subject.category;
    }

    if (Object.keys(patch).length > 0) {
      await dbPut('courses', { ...course, ...patch, updatedAt: now });
    }

    const merged = { ...course, ...patch } as Course;
    const list = coursesBySubject.get(subjectId) || [];
    list.push(merged);
    coursesBySubject.set(subjectId, list);
  }

  // ---------- 2) كورس لكل مادة ناقصة ----------
  if (opts.createMissingCourses) {
    for (const subject of SUBJECTS) {
      if ((coursesBySubject.get(subject.id) || []).length > 0) continue;
      const course: Course = {
        id: generateId(),
        name: subject.name,
        category: subject.category,
        description: subject.description,
        subjectId: subject.id,
        price: prices[subject.id],
        durationMonths: 1,
        icon: subject.icon,
        color: subject.color,
        levels: [],
        createdAt: now,
        updatedAt: now,
      };
      await dbAdd('courses', course);
      coursesBySubject.set(subject.id, [course]);
      report.coursesCreated++;
    }
  }

  // ---------- 3) المجموعات ترث مادة كورسها ----------
  const courseSubject = new Map<string, SubjectId>();
  for (const [subjectId, list] of coursesBySubject) {
    for (const c of list) courseSubject.set(c.id, subjectId);
  }

  /** المدرس ← مواده (من مجموعاته) */
  const teacherSubjects = new Map<string, Set<SubjectId>>();

  for (const group of groups) {
    const subjectId = courseSubject.get(group.courseId)
      ?? matchSubjectId(group.name)
      ?? group.subjectId;
    if (!subjectId) continue;

    if (group.subjectId !== subjectId) {
      await dbPut('groups', { ...group, subjectId, updatedAt: now });
      report.groupsLinked++;
    }
    const set = teacherSubjects.get(group.teacherId) || new Set<SubjectId>();
    set.add(subjectId);
    teacherSubjects.set(group.teacherId, set);
  }

  // ---------- 4) المدرسين ----------
  for (const teacher of teachers) {
    const fromGroups = [...(teacherSubjects.get(teacher.id) || [])];
    const fromSpecialization = matchSubjectId(teacher.specialization);
    const subjectIds = [...new Set([...fromGroups, ...(fromSpecialization ? [fromSpecialization] : [])])];
    if (subjectIds.length === 0) continue;

    const current = [...(teacher.subjectIds || [])].sort().join(',');
    if (current === [...subjectIds].sort().join(',')) continue;

    const specialization = teacher.specialization && teacher.specialization !== 'غير محدد'
      ? teacher.specialization
      : subjectIds.map(id => getSubject(id)!.name).join(' · ');

    await dbPut('teachers', { ...teacher, subjectIds, specialization, updatedAt: now });
    report.teachersLinked++;
  }

  // ---------- 5) الأقساط غير المدفوعة + أرصدة الطلاب ----------
  if (opts.updateUnpaidInstallments && repricedCourseIds.size > 0) {
    const affectedGroupIds = new Set(
      groups.filter(g => repricedCourseIds.has(g.courseId)).map(g => g.id)
    );
    if (affectedGroupIds.size > 0) {
      const [installments, enrollments, freshCourses] = await Promise.all([
        dbGetAll<Installment>('installments'),
        dbGetAll<Enrollment>('enrollments'),
        dbGetAll<Course>('courses'),
      ]);
      const priceByGroup = new Map<string, number>();
      for (const g of groups) {
        const c = freshCourses.find(x => x.id === g.courseId);
        if (c) priceByGroup.set(g.id, c.price);
      }
      /** التسجيلات اللي ليها سعر خاص أو خصم — ما نلمسش أقساطها */
      const customEnrollment = new Set(
        enrollments
          .filter(e => e.priceOverride !== undefined || e.discountAmount || e.discountPercent || e.isTrial)
          .map(e => e.id)
      );

      const today = dayjs().format('YYYY-MM-DD');
      const touchedStudents = new Set<string>();

      for (const inst of installments) {
        if (inst.deleted || inst.status === 'cancelled') continue;
        if (!affectedGroupIds.has(inst.groupId)) continue;
        if ((inst.paidAmount || 0) > 0) continue;              // مدفوع كلياً/جزئياً → ما نغيّرش
        if (inst.enrollmentId && customEnrollment.has(inst.enrollmentId)) continue;

        const newAmount = priceByGroup.get(inst.groupId);
        if (newAmount === undefined || newAmount === inst.amount) continue;

        const updated: Installment = { ...inst, amount: newAmount, updatedAt: now };
        await dbPut('installments', { ...updated, status: installmentState(updated, today) });
        report.installmentsUpdated++;
        touchedStudents.add(inst.studentId);
      }

      for (const studentId of touchedStudents) {
        await recalculateStudentTotalPaid(studentId);
        report.studentsRecalculated++;
      }
    }
  }

  // ---------- 6) ملخّص الأسعار ----------
  const finalCourses = await dbGetAll<Course>('courses');
  const finalGroups = await dbGetAll<Group>('groups');
  report.prices = SUBJECTS.map(s => ({
    id: s.id,
    name: s.name,
    price: prices[s.id],
    courses: finalCourses.filter(c => c.subjectId === s.id).length,
    groups: finalGroups.filter(g => g.subjectId === s.id).length,
  }));

  return report;
}
