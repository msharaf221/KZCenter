import { buildMonthlyPlan, type Installment } from '../../lib/billing';
import { membershipKey } from '../membership/keys';
import type { Course, Enrollment, Group, Student } from '../models';

export interface InstallmentMigrationReport { enrollmentsProcessed: number; installmentsCreated: number; studentsRecalculated: number }
interface MigrationData { enrollments: Enrollment[]; students: Student[]; groups: Group[]; courses: Course[]; installments: Installment[] }

/** Existing plans, even cancelled ones, cover their pair. Historical exits never authorize new billing. */
export function planMissingInstallments(data: MigrationData, now: string) {
  const students = new Map(data.students.filter(row => !row.deleted).map(row => [row.id, row]));
  const groups = new Map(data.groups.filter(row => !row.deleted).map(row => [row.id, row]));
  const courses = new Map(data.courses.filter(row => !row.deleted).map(row => [row.id, row]));
  const existing = data.installments.filter(row => !row.deleted);
  const covered = new Set(existing.map(row => membershipKey(row.studentId, row.groupId)));
  const coveredEnrollments = new Set(existing.map(row => row.enrollmentId).filter(Boolean));
  const history = new Set(data.enrollments.map(row => membershipKey(row.studentId, row.groupId)));
  const pairs = new Map<string, { studentId: string; groupId: string; startDate: string; enrollmentId?: string }>();
  for (const row of data.enrollments) if (!row.deleted && row.status === 'active' && !coveredEnrollments.has(row.id)) {
    const key = membershipKey(row.studentId, row.groupId);
    if (!covered.has(key) && !pairs.has(key)) pairs.set(key, { studentId: row.studentId, groupId: row.groupId, startDate: row.enrolledAt || row.createdAt, enrollmentId: row.id });
  }
  for (const student of students.values()) for (const groupId of student.enrolledGroups || []) {
    const key = membershipKey(student.id, groupId);
    if (!history.has(key) && !covered.has(key) && !pairs.has(key)) pairs.set(key, { studentId: student.id, groupId, startDate: student.createdAt });
  }
  const drafts: Omit<Installment, 'id'>[] = [];
  let enrollmentsProcessed = 0;
  for (const pair of pairs.values()) {
    const group = groups.get(pair.groupId), course = group && courses.get(group.courseId);
    if (!students.has(pair.studentId) || !group || !course) continue;
    // Keep the original legacy migration policy: one catalog-priced month, no rewriting of existing agreements/plans.
    for (const row of buildMonthlyPlan({ coursePrice: course.price, durationMonths: 1, startDate: pair.startDate })) {
      drafts.push({ ...row, studentId: pair.studentId, groupId: pair.groupId, enrollmentId: pair.enrollmentId, paidAmount: 0, status: 'pending', createdAt: now, updatedAt: now });
    }
    enrollmentsProcessed++;
  }
  return { drafts, enrollmentsProcessed, studentIds: [...new Set(drafts.map(row => row.studentId))] };
}
