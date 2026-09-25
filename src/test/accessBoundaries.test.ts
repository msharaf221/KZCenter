import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { dbAdd, dbBulkAdd, dbClearStore, dbPut, dbSoftDelete } from '../data/records';
import { BACKUP_STORES } from '../data/stores';
import { loadGroupsCatalog } from '../services/queries/groups';
import { loadStudentProfile } from '../services/queries/studentProfile';
import { loadStudentsList } from '../services/queries/students';
import { globalSearch } from '../lib/search';
import { createUser } from '../services/auth/users';
import {
  restoreLocalSession,
  resolveLocalSession,
  saveLocalSession,
  toSessionUser,
  SESSION_KEY,
} from '../services/auth/session';
import { payrollGroup, payrollStudent, payrollTeacher } from './helpers/payroll';

beforeEach(async () => {
  for (const store of [...BACKUP_STORES, 'users'] as const) await dbClearStore(store);
  sessionStorage.clear();
  localStorage.clear();
  await dbBulkAdd('teachers', [payrollTeacher(), payrollTeacher({ id: 'other-teacher' })]);
  await dbBulkAdd('groups', [
    payrollGroup(),
    payrollGroup({ id: 'other-group', teacherId: 'other-teacher', studentIds: ['other-student'] }),
  ]);
  await dbBulkAdd('students', [
    payrollStudent({ name: 'Synthetic own student' }),
    payrollStudent({ id: 'other-student', name: 'Synthetic other student', enrolledGroups: ['other-group'] }),
  ]);
});

describe('teacher read boundaries', () => {
  it('restricts group browsing as well as the student list to the linked teacher', async () => {
    const own = await loadGroupsCatalog({ search: '', subjectFilter: '', role: 'teacher', teacherId: 'teacher-1' });
    expect(own.groups.map(g => g.id)).toEqual(['group-1']);
    expect(own.students.map(s => s.id)).toEqual(['student-1']);
    const unlinked = await loadGroupsCatalog({ search: '', subjectFilter: '', role: 'teacher' });
    expect(unlinked.groups).toEqual([]);
  });
  it('does not expose a different teacher’s student through a direct profile URL', async () => {
    const viewer = { role: 'teacher', teacherId: 'teacher-1' } as const;
    expect((await loadStudentProfile('other-student', 7, viewer)).student).toBeNull();
    expect((await loadStudentProfile('student-1', 7, viewer)).student?.id).toBe('student-1');
    expect((await loadStudentProfile('other-student', 7, { role: 'admin' })).student?.id).toBe('other-student');
  });
  it('does not include other groups’ absences in a teacher’s student statistics', async () => {
    await dbBulkAdd('attendance', [
      { id: 'own', studentId: 'student-1', groupId: 'group-1', status: 'present', date: '2026-09-24' },
      { id: 'other', studentId: 'student-1', groupId: 'other-group', status: 'absent', date: '2026-09-24' },
    ]);
    const data = await loadStudentsList({
      page: 1,
      pageSize: 20,
      search: '',
      statusFilter: '',
      courseFilter: '',
      groupFilter: '',
      attendanceFilter: '',
      balanceFilter: '',
      role: 'teacher',
      teacherId: 'teacher-1',
    });
    expect(data.attStatsById['student-1']).toEqual({ total: 1, absent: 0 });
    expect(data.allStudents.map(s => s.id)).toEqual(['student-1']);
  });
  it('keeps global search closed until a teacher scope is known', async () => {
    expect(await globalSearch({ query: 'Synthetic', role: 'teacher' })).toEqual([]);
    const results = await globalSearch({ query: 'Synthetic', role: 'teacher', teacherId: 'teacher-1' });
    expect(results.filter(r => r.kind === 'student').map(r => r.id)).toEqual(['student-1']);
    const limited = await globalSearch({
      query: 'Synthetic',
      role: 'teacher',
      teacherId: 'teacher-1',
      allowedGroupIds: new Set(['other-group']),
    });
    expect(limited).toEqual([]);
  });
  it('does not put catalog prices in an academic-only search result', async () => {
    await dbAdd('courses', { id: 'test', name: 'Synthetic Course', price: 999, category: 'Academic', levels: [] });
    const result = await globalSearch({ query: 'Synthetic Course', role: 'supervisor' });
    expect(result.find(r => r.kind === 'course')?.subtitle).toBe('Academic');
  });
});

describe('persisted session boundary', () => {
  it.each(['__proto__', 'unknown', 'constructor'])('rejects unsupported role %s', role => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: 'test', username: 'test', role }));
    sessionStorage.setItem('educenter_session_ts', String(Date.now()));
    expect(restoreLocalSession()).toBeNull();
  });
  it('resolves current permissions from the local user row rather than trusting a stale admin snapshot', async () => {
    const user = await createUser('synthetic-user', 'Synthetic!Pass123', 'admin');
    saveLocalSession(toSessionUser(user), false);
    await dbPut('users', { ...user, role: 'teacher', teacherId: 'teacher-1' });
    expect(await resolveLocalSession()).toMatchObject({ role: 'teacher', teacherId: 'teacher-1' });
    // Resolution is intentionally side-effect-free after await; the provider owns publication.
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).role).toBe('admin');
  });
  it('will not restore a deleted account', async () => {
    const user = await createUser('synthetic-user', 'Synthetic!Pass123', 'teacher');
    saveLocalSession(toSessionUser(user), false);
    await dbSoftDelete('users', user.id);
    expect(await resolveLocalSession()).toBeNull();
  });
});
