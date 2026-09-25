import type { Installment } from '../../lib/billing';
import { getSubject, type SubjectId } from '../../lib/subjects';
import { membershipKey } from '../membership/keys';
import type { Course, Enrollment, Group, Student, Teacher } from '../models';
import type { DataIssue, IssueCode, IssueSeverity, QualityReport } from './qualityTypes';

export interface QualityData { students: Student[]; teachers: Teacher[]; courses: Course[]; groups: Group[]; enrollments: Enrollment[]; installments: Installment[] }
const PLACEHOLDER_PHONE = /^0?1?0{6,}\d*$/;
/** Analyze an accepted snapshot; no reads or writes hidden in the report calculation. */
export function qualityReport({ students, teachers, courses, groups, enrollments, installments }: QualityData): QualityReport {
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
    installments.filter(i => !i.deleted).map(i => membershipKey(i.studentId, i.groupId))
  );

  add('enrollment_without_installments', 'error',
    'تسجيلات من غير أقساط — الطالب مش هيظهر عليه مستحقات',
    activeEnrollments
      .filter(e => !installmentsByEnrollment.has(e.id) && !installmentPairs.has(membershipKey(e.studentId, e.groupId)))
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
    const subject = getSubject(id);
    return {
      id,
      name: subject?.name || String(id),
      courses: courses.filter(c => c.subjectId === id).length,
      groups: groups.filter(g => g.subjectId === id || courseById.get(g.courseId)?.subjectId === id).length,
      students: studentsBySubject.get(id)?.size || 0,
      price: courses.find(c => c.subjectId === id)?.price ?? subject?.monthlyPrice ?? 0,
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
