import type { Group } from './models';

/** Course/teacher cards count memberships, not distinct students across groups. */
export function countGroupLinks(groups: readonly Group[], key: 'courseId' | 'teacherId') {
  const groupCounts: Record<string, number> = {};
  const studentCounts: Record<string, number> = {};
  for (const group of groups) {
    const id = group[key];
    groupCounts[id] = (groupCounts[id] || 0) + 1;
    studentCounts[id] = (studentCounts[id] || 0) + group.studentIds.length;
  }
  return { groupCounts, studentCounts };
}
