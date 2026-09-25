import { readAll } from '../../data/readers';
import { countGroupLinks } from '../../domain/groupCounts';
import type { Course, Group } from '../../domain/models';

export async function loadCoursesCatalog({ search }: { search: string }) {
  const allCourses = await readAll<Course>('courses');

  const filtered = search ? allCourses.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : allCourses;

  const groups = await readAll<Group>('groups');

  const { groupCounts: gc, studentCounts: sc } = countGroupLinks(groups, 'courseId');
  return {
    courses: filtered,
    groupCounts: gc,
    studentCounts: sc,
  };
}
