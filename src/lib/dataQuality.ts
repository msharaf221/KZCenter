/**
 * فحص جودة الداتا وسلامة الروابط
 * ====================================
 *
 * بعد أي استيراد (أو في أي وقت) الفحص ده بيقول لك بالظبط إيه اللي «مش مظبوط»:
 * مجموعة من غير مدرس، كورس من غير مادة، طالب من غير مجموعة، سعر بصفر،
 * تسجيل من غير أقساط، مدرس من غير مواد… وكل مشكلة معاها **إصلاح تلقائي**
 * لو ينفع تتصلح لوحدها.
 *
 * الفلسفة: الاستيراد ما بيقولش «تمام» غير لما كل حاجة تبقى مترابطة فعلاً،
 * والباقي بيتعرض للمستخدم كقايمة مهام واضحة.
 */
import {
  dbGetAll, dbPut,
  type Course, type Group, type Student, type Teacher,
  type Enrollment, type Installment,
} from './db';
import { getSubject, matchSubjectId, type SubjectId } from './subjects';

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'group_without_teacher'
  | 'group_without_course'
  | 'group_without_subject'
  | 'group_without_schedule'
  | 'course_without_subject'
  | 'course_zero_price'
  | 'teacher_without_subjects'
  | 'teacher_without_groups'
  | 'student_without_group'
  | 'student_placeholder_phone'
  | 'enrollment_without_installments'
  | 'orphan_enrollment';

export interface DataIssue {
  code: IssueCode;
  severity: IssueSeverity;
  /** وصف المشكلة بالعربي */
  message: string;
  /** الكيانات المتأثرة (أسماء للعرض) */
  entities: string[];
  count: number;
  /** هل فيه إصلاح تلقائي؟ */
  autoFixable: boolean;
}

export interface QualityReport {
  issues: DataIssue[];
  /** نسبة الجودة من 100 (بتقل مع كل مشكلة حسب خطورتها) */
  score: number;
  /** ملخص أعداد الكيانات */
  totals: {
    students: number;
    teachers: number;
    courses: number;
    groups: number;
    enrollments: number;
    linkedGroups: number;
    subjectCoverage: number;
  };
  /** توزيع المجموعات والطلاب على المواد */
  bySubject: { id: SubjectId; name: string; courses: number; groups: number; students: number; price: number }[];
}

const PLACEHOLDER_PHONE = /^0?1?0{6,}\d*$/;

/** فحص شامل — بيقرا بس، ما بيغيّرش حاجة */
export async function auditData(): Promise<QualityReport> {
  const [students, teachers, courses, groups, enrollments, installments] = await Promise.all([
    dbGetAll<Student>('students'),
    dbGetAll<Teacher>('teachers'),
    dbGetAll<Course>('courses'),
    dbGetAll<Group>('groups'),
    dbGetAll<Enrollment>('enrollments'),
    dbGetAll<Installment>('installments'),
  ]);

  const teacherById = new Map(teachers.map(t => [t.id, t]));
  const courseById = new Map(courses.map(c => [c.id, c]));
  const groupById = new Map(groups.map(g => [g.id, g]));
  const issues: DataIssue[] = [];

  const add = (
    code: IssueCode,
    severity: IssueSeverity,
    message: string,
    entities: string[],
    autoFixable: boolean,
  ) => {
    if (entities.length === 0) return;
    issues.push({ code, severity, message, entities: entities.slice(0, 50), count: entities.length, autoFixable });
  };

  // ---------- المجموعات ----------
  add('group_without_teacher', 'error',
    'مجموعات مش مربوطة بمدرس موجود',
    groups.filter(g => !g.teacherId || !teacherById.has(g.teacherId)).map(g => g.name),
    false);

  add('group_without_course', 'error',
    'مجموعات مش مربوطة بكورس موجود',
    groups.filter(g => !g.courseId || !courseById.has(g.courseId)).map(g => g.name),
    false);

  add('group_without_subject', 'warning',
    'مجموعات من غير مادة (السعر والتقارير مش هتتجمّع صح)',
    groups.filter(g => !g.subjectId && !courseById.get(g.courseId)?.subjectId).map(g => g.name),
    true);

  add('group_without_schedule', 'warning',
    'مجموعات من غير جدول (يوم/ميعاد) — مش هتظهر في الجدول الأسبوعي',
    groups
      .filter(g => !g.schedule?.length || g.schedule.every(s => !s.days?.length || !s.startTime))
      .map(g => g.name),
    false);

  // ---------- الكورسات ----------
  add('course_without_subject', 'warning',
    'كورسات مش مربوطة بمادة',
    courses.filter(c => !c.subjectId).map(c => c.name),
    true);

  add('course_zero_price', 'error',
    'كورسات سعرها صفر — الطلاب مش هيتحسب عليهم مديونية',
    courses.filter(c => !c.price || c.price <= 0).map(c => c.name),
    true);

  // ---------- المدرسين ----------
  const groupsByTeacher = new Map<string, Group[]>();
  for (const g of groups) {
    groupsByTeacher.set(g.teacherId, [...(groupsByTeacher.get(g.teacherId) || []), g]);
  }

  add('teacher_without_subjects', 'warning',
    'مدرسين من غير مواد محددة',
    teachers.filter(t => !(t.subjectIds || []).length).map(t => t.name),
    true);

  add('teacher_without_groups', 'info',
    'مدرسين من غير مجموعات',
    teachers.filter(t => !(groupsByTeacher.get(t.id) || []).length).map(t => t.name),
    false);

  // ---------- الطلاب ----------
  const activeEnrollments = enrollments.filter(e => e.status === 'active' && !e.deleted);
  const enrolledStudentIds = new Set(activeEnrollments.map(e => e.studentId));

  add('student_without_group', 'warning',
    'طلاب مش مسجلين في أي مجموعة',
    students.filter(s => s.status === 'active' && !enrolledStudentIds.has(s.id)).map(s => s.name),
    false);

  add('student_placeholder_phone', 'info',
    'طلاب برقم تليفون مؤقت (placeholder) — محتاج تعديل',
    students.filter(s => PLACEHOLDER_PHONE.test(String(s.phone || ''))).map(s => s.name),
    false);

  // ---------- التسجيلات والأقساط ----------
  const installmentsByEnrollment = new Set(
    installments.filter(i => !i.deleted && i.enrollmentId).map(i => i.enrollmentId as string)
  );
  const installmentPairs = new Set(
    installments.filter(i => !i.deleted).map(i => `${i.studentId}:${i.groupId}`)
  );

  add('enrollment_without_installments', 'error',
    'تسجيلات من غير أقساط — الطالب مش هيظهر عليه مستحقات',
    activeEnrollments
      .filter(e => !installmentsByEnrollment.has(e.id) && !installmentPairs.has(`${e.studentId}:${e.groupId}`))
      .map(e => {
        const s = students.find(x => x.id === e.studentId);
        const g = groupById.get(e.groupId);
        return `${s?.name || e.studentId} ← ${g?.name || e.groupId}`;
      }),
    false);

  add('orphan_enrollment', 'error',
    'تسجيلات لمجموعات أو طلاب محذوفين',
    activeEnrollments
      .filter(e => !groupById.has(e.groupId) || !students.some(s => s.id === e.studentId))
      .map(e => `${e.studentId} ← ${e.groupId}`),
    false);

  // ---------- الملخص ----------
  const linkedGroups = groups.filter(g =>
    g.teacherId && teacherById.has(g.teacherId)
    && g.courseId && courseById.has(g.courseId)
    && (g.subjectId || courseById.get(g.courseId)?.subjectId)
  ).length;

  const studentsBySubject = new Map<SubjectId, Set<string>>();
  for (const e of activeEnrollments) {
    const g = groupById.get(e.groupId);
    const subjectId = g?.subjectId ?? (g ? courseById.get(g.courseId)?.subjectId : undefined);
    if (!subjectId) continue;
    const set = studentsBySubject.get(subjectId) || new Set<string>();
    set.add(e.studentId);
    studentsBySubject.set(subjectId, set);
  }

  const subjectIds = [...new Set([
    ...courses.map(c => c.subjectId),
    ...groups.map(g => g.subjectId),
  ])].filter((id): id is SubjectId => !!id);

  const bySubject = subjectIds.map(id => {
    const subject = getSubject(id)!;
    return {
      id,
      name: subject.name,
      courses: courses.filter(c => c.subjectId === id).length,
      groups: groups.filter(g => g.subjectId === id || courseById.get(g.courseId)?.subjectId === id).length,
      students: studentsBySubject.get(id)?.size || 0,
      price: courses.find(c => c.subjectId === id)?.price ?? subject.monthlyPrice,
    };
  });

  // النتيجة: كل خطأ -10، تحذير -4، معلومة -1 (بحد أدنى صفر)
  const penalty = issues.reduce((sum, i) =>
    sum + (i.severity === 'error' ? 10 : i.severity === 'warning' ? 4 : 1), 0);

  return {
    issues,
    score: Math.max(0, 100 - penalty),
    totals: {
      students: students.length,
      teachers: teachers.length,
      courses: courses.length,
      groups: groups.length,
      enrollments: activeEnrollments.length,
      linkedGroups,
      subjectCoverage: groups.length > 0 ? Math.round((linkedGroups / groups.length) * 100) : 100,
    },
    bySubject,
  };
}

export interface AutoFixReport {
  coursesLinked: number;
  coursesRepriced: number;
  groupsLinked: number;
  teachersLinked: number;
  remaining: number;
}

/**
 * إصلاح تلقائي للمشاكل اللي ينفع تتصلح لوحدها:
 *  - كورس من غير مادة → يتخمّن من اسمه
 *  - كورس بسعر صفر ومربوط بمادة → ياخد سعر المادة
 *  - مجموعة من غير مادة → مادة كورسها
 *  - مدرس من غير مواد → مواد مجموعاته
 */
export async function autoFix(prices?: Partial<Record<SubjectId, number>>): Promise<AutoFixReport> {
  const [courses, groups, teachers] = await Promise.all([
    dbGetAll<Course>('courses'),
    dbGetAll<Group>('groups'),
    dbGetAll<Teacher>('teachers'),
  ]);
  const now = new Date().toISOString();
  const report: AutoFixReport = {
    coursesLinked: 0, coursesRepriced: 0, groupsLinked: 0, teachersLinked: 0, remaining: 0,
  };

  // 1) الكورسات
  const courseSubject = new Map<string, SubjectId>();
  for (const c of courses) {
    let subjectId = c.subjectId;
    const patch: Partial<Course> = {};

    if (!subjectId) {
      const guessed = matchSubjectId(c.name, c.description, c.category);
      if (guessed) {
        subjectId = guessed;
        patch.subjectId = guessed;
        report.coursesLinked++;
      }
    }
    if (subjectId && (!c.price || c.price <= 0)) {
      patch.price = prices?.[subjectId] ?? getSubject(subjectId)!.monthlyPrice;
      report.coursesRepriced++;
    }
    if (Object.keys(patch).length > 0) {
      await dbPut('courses', { ...c, ...patch, updatedAt: now });
    }
    if (subjectId) courseSubject.set(c.id, subjectId);
  }

  // 2) المجموعات
  const teacherSubjects = new Map<string, Set<SubjectId>>();
  for (const g of groups) {
    const subjectId = g.subjectId ?? courseSubject.get(g.courseId) ?? matchSubjectId(g.name) ?? undefined;
    if (!subjectId) continue;
    if (!g.subjectId) {
      await dbPut('groups', { ...g, subjectId, updatedAt: now });
      report.groupsLinked++;
    }
    const set = teacherSubjects.get(g.teacherId) || new Set<SubjectId>();
    set.add(subjectId);
    teacherSubjects.set(g.teacherId, set);
  }

  // 3) المدرسين
  for (const t of teachers) {
    const fromGroups = teacherSubjects.get(t.id);
    if (!fromGroups?.size) continue;
    const merged = [...new Set([...(t.subjectIds || []), ...fromGroups])];
    if (merged.length === (t.subjectIds || []).length) continue;
    const names = merged.map(id => getSubject(id)?.name).filter(Boolean).join(' · ');
    await dbPut('teachers', {
      ...t,
      subjectIds: merged,
      specialization: t.specialization && t.specialization !== 'غير محدد' ? t.specialization : names,
      updatedAt: now,
    });
    report.teachersLinked++;
  }

  const after = await auditData();
  report.remaining = after.issues.filter(i => i.autoFixable).length;
  return report;
}
