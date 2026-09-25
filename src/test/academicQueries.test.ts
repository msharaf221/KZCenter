import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_STORES } from '../data/stores';
import { dbAdd, dbBulkAdd, dbClearStore } from '../data/records';
import { loadAttendanceCatalog, loadAttendanceRegister } from '../services/queries/attendance';
import { loadExamsCatalog } from '../services/queries/exams';
import { loadStudentProfile } from '../services/queries/studentProfile';
import { loadTeacherProfile } from '../services/queries/teacherProfile';
import { payrollGroup, payrollStudent, payrollTeacher } from './helpers/payroll';

beforeEach(async () => {
  for (const store of BACKUP_STORES) await dbClearStore(store);
});
describe('academic read models', () => {
  it('scopes attendance/exam catalogs to the linked teacher', async () => {
    await dbBulkAdd('groups', [payrollGroup(), payrollGroup({ id: 'other', teacherId: 'other-teacher' })]);
    await dbBulkAdd('exams', [
      { id: 'first', groupId: 'group-1' },
      { id: 'second', groupId: 'other' },
    ]);
    expect((await loadAttendanceCatalog('teacher', 'teacher-1')).groups.map(g => g.id)).toEqual(['group-1']);
    expect((await loadExamsCatalog('teacher', 'teacher-1')).exams.map(e => e.id)).toEqual(['first']);
    expect((await loadExamsCatalog('teacher')).groups).toEqual([]);
  });
  it('keeps existing attendance and marks later enrollment dates without inventing absences', async () => {
    await dbAdd('groups', payrollGroup());
    await dbAdd('students', payrollStudent());
    await dbAdd('enrollments', {
      id: 'enrollment',
      studentId: 'student-1',
      groupId: 'group-1',
      enrolledAt: '2026-09-20',
      status: 'active',
    });
    await dbAdd('attendance', {
      id: 'record',
      studentId: 'student-1',
      groupId: 'group-1',
      date: '2026-09-10',
      status: 'present',
    });
    const data = await loadAttendanceRegister('group-1', '2026-09-10');
    expect(data.statuses).toEqual({ 'student-1': 'present' });
    expect(data.lateJoiners.has('student-1')).toBe(true);
    expect(data.records).toHaveLength(1);
    expect(data.students.map(s => s.id)).toEqual(['student-1']);
    expect((await loadAttendanceRegister('group-1', '2026-09-21')).lateJoiners.size).toBe(0);
  });
  it('returns a keyed empty profile for missing records without navigation side effects', async () => {
    expect(await loadStudentProfile('missing')).toMatchObject({ requestedId: 'missing', student: null });
    expect(await loadTeacherProfile('missing')).toMatchObject({ requestedId: 'missing', teacher: null });
  });
  it('deduplicates teacher students across groups and retains profile enrichment', async () => {
    await dbAdd('teachers', payrollTeacher());
    await dbAdd('students', payrollStudent());
    await dbBulkAdd('groups', [payrollGroup(), payrollGroup({ id: 'another-group' })]);
    await dbBulkAdd('enrollments', [
      { id: 'e1', studentId: 'student-1', groupId: 'group-1', status: 'active' },
      { id: 'e2', studentId: 'student-1', groupId: 'another-group', status: 'active' },
    ]);
    const data = await loadTeacherProfile('teacher-1');
    expect(data.students.map(s => s.id)).toEqual(['student-1']);
    expect(data.groups).toHaveLength(2);
    expect(data.groups[0].courseName).toBe('غير معروف');
  });
});
