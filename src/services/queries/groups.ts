import { readAll } from '../../data/readers';
import type { Course, Group, Student, Teacher, UserRole } from '../../domain/models';
import { visibleGroupIds } from '../../lib/permissions';
import type { SubjectId } from '../../lib/subjects';
import { cleanGroupMembers } from '../groupService';

export async function loadGroupsCatalog({ search, subjectFilter, role, teacherId }: { search: string; subjectFilter: SubjectId | ''; role?: UserRole; teacherId?: string }) {
  const [g, c, t, s] = await Promise.all([
    readAll<Group>('groups'),
    readAll<Course>('courses'),
    readAll<Teacher>('teachers'),
    readAll<Student>('students'),
  ]);

  const allowed = visibleGroupIds({ role, teacherId, groups: g });
  const visible = allowed ? g.filter(group => allowed.has(group.id)) : g;
  const refreshed = await cleanGroupMembers(visible, s);
  const freshAllowed = visibleGroupIds({ role, teacherId, groups: refreshed });
  const cleanedGroups = freshAllowed ? refreshed.filter(group => freshAllowed.has(group.id)) : refreshed;

  // مادة المجموعة: المخزّنة عليها، وإلا مادة كورسها (البيانات القديمة)
  const subjectOf = (gr: Group): SubjectId | undefined =>
    gr.subjectId ?? c.find(course => course.id === gr.courseId)?.subjectId;
  return {
    groups: cleanedGroups.filter(
      gr =>
        (!search || gr.name.toLowerCase().includes(search.toLowerCase())) &&
        (!subjectFilter || subjectOf(gr) === subjectFilter),
    ),
    courses: c,
    teachers: t,
    students: allowed ? s.filter(student => cleanedGroups.some(group => group.studentIds.includes(student.id))) : s,
  };
}
