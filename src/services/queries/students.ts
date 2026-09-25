import { readAll } from '../../data/readers';
import type { Attendance, Course, Group, Student, UserRole } from '../../domain/models';
import { newestFirst, paginate } from '../../lib/pagination';
import { visibleGroupIds } from '../../lib/permissions';
import type { ListQuery } from './types';

export interface StudentListQuery extends ListQuery {
  statusFilter: string;
  groupFilter: string;
  courseFilter: string;
  balanceFilter: string;
  attendanceFilter: string;
  role?: UserRole;
  teacherId?: string;
}

export async function loadStudentsList({
  page,
  pageSize,
  search,
  statusFilter,
  groupFilter,
  courseFilter,
  balanceFilter,
  attendanceFilter,
  role,
  teacherId,
}: StudentListQuery) {
  const [everyGroup, allCourses, allAttendance, allStudents] = await Promise.all([
    readAll<Group>('groups'),
    readAll<Course>('courses'),
    readAll<Attendance>('attendance'),
    readAll<Student>('students'),
  ]);

  // المدرس يشوف مجموعاته وطلابها هو بس
  const allowed = visibleGroupIds({ role, teacherId, groups: everyGroup });

  const allGroups = allowed ? everyGroup.filter(g => allowed.has(g.id)) : everyGroup;

  // تجميع إحصائيات الحضور لكل طالب (غياب/إجمالي سجلات)
  const stats: Record<string, { absent: number; total: number }> = {};

  for (const a of (allowed ? allAttendance.filter(record => allowed.has(record.groupId)) : allAttendance)) {
    if (!stats[a.studentId]) stats[a.studentId] = { absent: 0, total: 0 };
    stats[a.studentId].total += 1;
    if (a.status === 'absent') stats[a.studentId].absent += 1;
  }

  const filtered = allStudents.filter(s => {
    if (allowed && !(s.enrolledGroups || []).some(gid => allowed.has(gid))) return false;
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.parentPhone.includes(q);
    const matchStatus = !statusFilter || s.status === statusFilter;
    const matchGroup = !groupFilter || s.enrolledGroups?.includes(groupFilter);

    let matchCourse = true;
    if (courseFilter) {
      const studentGroups = allGroups.filter(g => s.enrolledGroups?.includes(g.id));
      matchCourse = studentGroups.some(g => g.courseId === courseFilter);
    }

    // فلتر المتبقي (مبني على المستحقات المحسوبة على الطالب)
    const remaining = (s.totalOwed || 0) - s.totalPaid;
    const matchBalance =
      !balanceFilter || (balanceFilter === 'debt' && remaining > 0) || (balanceFilter === 'settled' && remaining <= 0);

    // فلتر الغياب: غاب على الأقل مرة / غياب متكرر (3+) / بدون سجل حضور
    const st = stats[s.id];
    const absentCount = st?.absent || 0;
    const totalCount = st?.total || 0;
    const matchAttendance =
      !attendanceFilter ||
      (attendanceFilter === 'absent' && absentCount > 0) ||
      (attendanceFilter === 'repeat' && absentCount >= 3) ||
      (attendanceFilter === 'none' && totalCount === 0);

    return matchSearch && matchStatus && matchGroup && matchCourse && matchBalance && matchAttendance;
  });
  const result = paginate(newestFirst(filtered), page, pageSize);
  return {
    groups: allGroups,
    courses: allCourses,
    attStatsById: stats,
    students: result.items,
    total: result.total,
    allStudents: allowed ? allStudents.filter(student => student.enrolledGroups?.some(id => allowed.has(id))) : allStudents,
  };
}
