import { readAll, readById } from '../../data/readers';
import type { Course, Group, Student, Teacher } from '../../domain/models';
import { getGroupStudents } from '../enrollmentService';

export function emptyTeacherProfile(requestedId = '') {
  return {
    requestedId,
    teacher: null as Teacher | null,
    groups: [] as (Group & { courseName: string })[],
    students: [] as Student[],
  };
}

export async function loadTeacherProfile(id: string) {
  const t = await readById<Teacher>('teachers', id);

  if (!t) return emptyTeacherProfile(id);

  const allGroups = await readAll<Group>('groups');

  const teacherGroups = allGroups.filter(g => g.teacherId === id && !g.deleted);

  const courses = await readAll<Course>('courses');

  const enrichedGroups = teacherGroups.map(g => ({
    ...g,
    courseName: courses.find(c => c.id === g.courseId)?.name || 'غير معروف',
  }));

  // Get enrolled students from enrollments table (source of truth)
  const teacherStudents: Student[] = [];

  for (const g of teacherGroups) {
    const groupStudents = await getGroupStudents(g.id);
    for (const s of groupStudents) {
      if (!teacherStudents.some(ts => ts.id === s.id)) {
        teacherStudents.push(s);
      }
    }
  }
  return { requestedId: id, teacher: t, groups: enrichedGroups, students: teacherStudents };
}
