import { readAll } from '../../data/readers';
import type { UserRole } from '../../domain/models';
import { visibleGroupIds } from '../../lib/permissions';

export async function loadExamsCatalog(role?: UserRole, teacherId?: string) {
  const [exams, groups, courses] = await Promise.all([readAll('exams'), readAll('groups'), readAll('courses')]);
  const allowed = visibleGroupIds({ role, teacherId, groups });
  return {
    exams: allowed ? exams.filter(exam => allowed.has(exam.groupId)) : exams,
    groups: allowed ? groups.filter(group => allowed.has(group.id)) : groups,
    courses,
  };
}
