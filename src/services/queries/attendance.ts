import { readAll, readByIndex } from '../../data/readers';
import type { Attendance, AttendanceStatus, Student, UserRole } from '../../domain/models';
import { visibleGroupIds } from '../../lib/permissions';
import { getGroupStudents } from '../enrollmentService';
import { getGroupAttendanceForDate } from '../groupService';

export async function loadAttendanceCatalog(role?: UserRole, teacherId?: string) {
  const [groups, courses] = await Promise.all([readAll('groups'), readAll('courses')]);
  const allowed = visibleGroupIds({ role, teacherId, groups });
  return { groups: allowed ? groups.filter(group => allowed.has(group.id)) : groups, courses };
}

export interface AttendanceRegister {
  records: Attendance[];
  students: Student[];
  statuses: Record<string, AttendanceStatus>;
  lateJoiners: Set<string>;
}

export async function loadAttendanceRegister(groupId: string, date: string): Promise<AttendanceRegister> {
  const [records, students, enrollments] = await Promise.all([
    getGroupAttendanceForDate(groupId, date),
    getGroupStudents(groupId),
    readByIndex('enrollments', 'by-groupId', groupId),
  ]);
  const statuses: Record<string, AttendanceStatus> = {};
  records.forEach(record => {
    statuses[record.studentId] = record.status;
  });
  const lateJoiners = new Set(
    enrollments
      .filter(e => e.status === 'active' && !e.deleted && (e.enrolledAt || '').slice(0, 10) > date.slice(0, 10))
      .map(e => e.studentId),
  );
  return { records, students, statuses, lateJoiners };
}
