import { readAll, readPage } from '../../data/readers';
import { countGroupLinks } from '../../domain/groupCounts';
import type { Group, Teacher } from '../../domain/models';
import { getSubject } from '../../lib/subjects';
import type { ListQuery } from './types';

export async function loadTeachersList({ page, pageSize, search }: ListQuery) {
  const result = await readPage<Teacher>('teachers', page, pageSize, (t: Teacher) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const subjectNames = (t.subjectIds || [])
      .map(id => getSubject(id)?.name || '')
      .join(' ')
      .toLowerCase();
    return t.name.toLowerCase().includes(q) || t.specialization.toLowerCase().includes(q) || subjectNames.includes(q);
  });

  const groups = await readAll<Group>('groups');

  const { groupCounts: gc, studentCounts: sc } = countGroupLinks(groups, 'teacherId');
  return {
    teachers: result.items,
    total: result.total,
    groupCounts: gc,
    studentCounts: sc,
  };
}
