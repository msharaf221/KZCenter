import { membershipKey } from '../membership/keys';
import type { Course, Enrollment, Group, Student, Teacher } from '../models';

export interface IntegrityReport {
  staleEnrollments: number;
  staleGroupMembers: number;
  orphanGroupCourses: string[];
  orphanGroupTeachers: string[];
  recalculatedStudents: number;
}
export interface IntegrityInput { students: Student[]; groups: Group[]; courses: Course[]; teachers: Teacher[]; enrollments: Enrollment[] }
const differenceCount = (previous: string[], next: string[]) => previous.length + next.length - 2 * new Set(previous.filter(id => next.includes(id))).size;

/** Repair links only. Explicit withdrawal/transfer/completion/tombstones outrank legacy membership arrays. */
export function planIntegrity(data: IntegrityInput, now: string) {
  const students = data.students.filter(row => !row.deleted), groups = data.groups.filter(row => !row.deleted);
  const byStudent = new Map(students.map(row => [row.id, row])), byGroup = new Map(groups.map(row => [row.id, row]));
  const history = new Set(data.enrollments.map(row => membershipKey(row.studentId, row.groupId)));
  const canonical = new Map<string, { studentId: string; groupId: string }>();
  const studentPatches: Student[] = [], groupPatches: Group[] = [], enrollmentPatches: Enrollment[] = [];
  const newEnrollments: Omit<Enrollment, 'id'>[] = [];
  const affected = new Set<string>();
  const report: IntegrityReport = { staleEnrollments: 0, staleGroupMembers: 0, orphanGroupCourses: [], orphanGroupTeachers: [], recalculatedStudents: 0 };
  for (const row of data.enrollments) {
    if (row.deleted) continue;
    if (!byStudent.has(row.studentId) || !byGroup.has(row.groupId)) {
      enrollmentPatches.push({ ...row, deleted: true, updatedAt: now, ...{ deletedAt: now } });
      if (byStudent.has(row.studentId)) affected.add(row.studentId);
      report.staleEnrollments++;
    } else if (row.status === 'active') canonical.set(membershipKey(row.studentId, row.groupId), row);
  }
  const considerLegacy = (studentId: string, groupId: string) => {
    const student = byStudent.get(studentId), group = byGroup.get(groupId), key = membershipKey(studentId, groupId);
    if (!student || !group || history.has(key) || canonical.has(key)) return;
    canonical.set(key, { studentId, groupId });
    newEnrollments.push({ studentId, groupId, status: 'active', enrolledAt: group.createdAt || now, createdAt: now, updatedAt: now });
    affected.add(studentId);
    report.staleEnrollments++;
  };
  for (const group of groups) for (const studentId of group.studentIds) considerLegacy(studentId, group.id);
  for (const student of students) for (const groupId of student.enrolledGroups || []) considerLegacy(student.id, groupId);

  const studentGroups = new Map<string, Set<string>>(), groupStudents = new Map<string, Set<string>>();
  for (const pair of canonical.values()) {
    const gs = studentGroups.get(pair.studentId) || new Set<string>(); gs.add(pair.groupId); studentGroups.set(pair.studentId, gs);
    const ss = groupStudents.get(pair.groupId) || new Set<string>(); ss.add(pair.studentId); groupStudents.set(pair.groupId, ss);
  }
  for (const student of students) {
    const wanted = studentGroups.get(student.id) || new Set<string>(), previous = student.enrolledGroups || [];
    const next = [...new Set([...previous.filter(id => wanted.has(id)), ...wanted])];
    const changes = differenceCount(previous, next);
    if (changes) {
      studentPatches.push({ ...student, enrolledGroups: next, updatedAt: now });
      report.staleEnrollments += changes;
      affected.add(student.id);
    }
  }
  const courses = new Set(data.courses.filter(row => !row.deleted).map(row => row.id));
  const teachers = new Set(data.teachers.filter(row => !row.deleted).map(row => row.id));
  for (const group of groups) {
    const wanted = groupStudents.get(group.id) || new Set<string>();
    const next = [...new Set([...group.studentIds.filter(id => wanted.has(id)), ...wanted])];
    const changes = differenceCount(group.studentIds, next);
    const status = group.status === 'ended' ? 'ended' : next.length >= group.maxStudents ? 'full' : 'open';
    if (changes || status !== group.status) groupPatches.push({ ...group, studentIds: next, status, updatedAt: now });
    report.staleGroupMembers += changes;
    if (!courses.has(group.courseId)) report.orphanGroupCourses.push(group.name);
    if (!teachers.has(group.teacherId)) report.orphanGroupTeachers.push(group.name);
  }
  report.recalculatedStudents = affected.size;
  return { studentPatches, groupPatches, enrollmentPatches, newEnrollments, affectedStudentIds: [...affected], report };
}
