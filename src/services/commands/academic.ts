import dayjs from 'dayjs';
import { writeTransaction } from '../../data/transactions';
import { requireRule } from '../../domain/errors';
import type { Attendance, AttendanceStatus, Exam, Grade, Student } from '../../domain/models';
import { isDeleted } from '../../domain/recordState';
import { requireChoice, requireDate, requireLive, requireNumber, requireText } from '../../domain/validation';
import { generateId } from '../../lib/ids';
import { commandAudit, requireGroupAccess, requirePermission, type Actor } from './access';

export type ExamDraft = Pick<Exam, 'name' | 'groupId' | 'date' | 'maxGrade'>;
export async function saveExam(actor: Actor, draft: ExamDraft, id?: string): Promise<Exam> {
  requirePermission(actor, 'exams', id ? 'edit' : 'create');
  requireText(draft.name, 'اسم الاختبار مطلوب');
  requireDate(draft.date);
  requireNumber(draft.maxGrade, 'الدرجة العظمى يجب أن تكون أكبر من صفر', Number.MIN_VALUE);
  const saved = await writeTransaction(['exams', 'groups'], async tx => {
    const store = tx.objectStore('exams');
    const current = id ? requireLive(await store.get(id), 'الاختبار غير موجود') : undefined;
    if (current)
      requireGroupAccess(
        actor,
        requireLive(await tx.objectStore('groups').get(current.groupId), 'المجموعة غير موجودة'),
      );
    const group = requireLive(await tx.objectStore('groups').get(draft.groupId), 'اختر مجموعة موجودة');
    requireGroupAccess(actor, group);
    const now = new Date().toISOString();
    const row: Exam = {
      ...current,
      id: current?.id || generateId(),
      name: draft.name,
      groupId: draft.groupId,
      date: draft.date,
      maxGrade: draft.maxGrade,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await store.put(row);
    return row;
  });
  commandAudit(actor, {
    action: id ? 'update' : 'create',
    entity: 'exam',
    entityId: saved.id,
    details: `${id ? 'تعديل' : 'إضافة'} اختبار: ${saved.name}`,
  });
  return saved;
}

export async function deleteExam(actor: Actor, id: string): Promise<void> {
  requirePermission(actor, 'exams', 'delete');
  await writeTransaction(['exams'], async tx => {
    const store = tx.objectStore('exams');
    const row = requireLive(await store.get(id), 'الاختبار غير موجود');
    const now = new Date().toISOString();
    const deleted = { ...row, deleted: true, deletedAt: now, deletedBy: actor.id, updatedAt: now };
    await store.put(deleted);
  });
  commandAudit(actor, { action: 'delete', entity: 'exam', entityId: id, details: 'حذف اختبار' });
}

/** All submitted grades validate before any write; concurrent saves cannot create duplicate grade rows. */
export async function saveExamGrades(actor: Actor, examId: string, grades: Record<string, number>): Promise<void> {
  requirePermission(actor, 'exams', 'edit');
  await writeTransaction(['exams', 'groups', 'enrollments', 'students', 'grades'], async tx => {
    const exam = requireLive(await tx.objectStore('exams').get(examId), 'الاختبار غير موجود');
    const group = requireLive(await tx.objectStore('groups').get(exam.groupId), 'المجموعة غير موجودة');
    requireGroupAccess(actor, group);
    const enrolled = (await tx.objectStore('enrollments').index('by-groupId').getAll(group.id)).filter(
      e => !e.deleted && e.status === 'active',
    );
    const activeIds = new Set<string>();
    for (const id of new Set(enrolled.map(e => e.studentId))) {
      const student = await tx.objectStore('students').get(id);
      if (student && !student.deleted) activeIds.add(id);
    }
    for (const [id, grade] of Object.entries(grades)) {
      requireRule(activeIds.has(id), 'قائمة الطلاب تغيرت؛ أعد تحميل الاختبار قبل الحفظ');
      requireNumber(grade, `الدرجة غير صحيحة (0 - ${exam.maxGrade})`);
      requireRule(grade <= exam.maxGrade, `الدرجة غير صحيحة (0 - ${exam.maxGrade})`);
    }
    const store = tx.objectStore('grades');
    const existing = (await store.index('by-examId').getAll(examId)).filter(grade => !isDeleted(grade));
    const now = new Date().toISOString();
    for (const [studentId, grade] of Object.entries(grades)) {
      const previous = existing.find(row => row.studentId === studentId);
      const row: Grade = {
        ...previous,
        id: previous?.id || generateId(),
        studentId,
        examId,
        grade,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      await store.put(row);
    }
  });
  commandAudit(actor, {
    action: 'update',
    entity: 'exam',
    entityId: examId,
    details: `حفظ درجات ${Object.keys(grades).length} طالب`,
  });
}

export interface AttendanceSubmission {
  groupId: string;
  date: string;
  studentIds: string[];
  statuses: Record<string, AttendanceStatus>;
}
export async function saveAttendance(actor: Actor, input: AttendanceSubmission) {
  requirePermission(actor, 'attendance', 'edit');
  requireDate(input.date);
  const result = await writeTransaction(['groups', 'students', 'enrollments', 'attendance'], async tx => {
    const group = requireLive(await tx.objectStore('groups').get(input.groupId), 'المجموعة غير موجودة');
    requireGroupAccess(actor, group);
    const enrollments = (await tx.objectStore('enrollments').index('by-groupId').getAll(group.id)).filter(
      e => !e.deleted && e.status === 'active',
    );
    const students: Student[] = [];
    for (const id of new Set(enrollments.map(e => e.studentId))) {
      const student = await tx.objectStore('students').get(id);
      if (student && !student.deleted) students.push(student);
    }
    const expected = new Set(input.studentIds);
    requireRule(
      expected.size === students.length && students.every(student => expected.has(student.id)),
      'قائمة الطلاب تغيرت؛ أعد تحميل الحضور قبل الحفظ',
    );
    for (const value of Object.values(input.statuses))
      requireChoice(value, ['present', 'absent', 'late', 'excused'], 'حالة الحضور غير صحيحة');
    const store = tx.objectStore('attendance');
    const records = (
      store.indexNames.contains('by-groupDate')
        ? await store.index('by-groupDate').getAll([group.id, input.date])
        : (await store.getAll()).filter(row => row.groupId === group.id && row.date === input.date)
    ).filter(record => !isDeleted(record));
    const late = new Set(enrollments.filter(e => (e.enrolledAt || '').slice(0, 10) > input.date).map(e => e.studentId));
    const newlyAbsent: Student[] = [],
      absent: Student[] = [];
    const now = new Date().toISOString();
    let savedCount = 0;
    for (const student of students) {
      const previous = records.find(row => row.studentId === student.id);
      if (late.has(student.id) && !previous) continue;
      const status = input.statuses[student.id] || 'absent';
      if (status === 'absent') {
        absent.push(student);
        if (previous?.status !== 'absent') newlyAbsent.push(student);
      }
      const row: Attendance = previous
        ? { ...previous, status, updatedAt: now }
        : {
            id: generateId(),
            studentId: student.id,
            groupId: group.id,
            date: input.date,
            status,
            checkInTime: status === 'present' ? dayjs().format('HH:mm') : undefined,
            createdAt: now,
            updatedAt: now,
          };
      await store.put(row);
      savedCount++;
    }
    return { group, savedCount, newlyAbsent, absent };
  });
  commandAudit(actor, {
    action: 'update',
    entity: 'attendance',
    entityId: input.groupId,
    details: `تسجيل حضور: ${result.group.name} - ${input.date} (${result.savedCount} طالب)`,
  });
  return result;
}

export async function checkOutStudent(actor: Actor, attendanceId: string): Promise<void> {
  requirePermission(actor, 'attendance', 'edit');
  await writeTransaction(['attendance', 'groups'], async tx => {
    const store = tx.objectStore('attendance');
    const current = requireLive(await store.get(attendanceId), 'يجب تسجيل الحضور أولاً');
    const group = requireLive(await tx.objectStore('groups').get(current.groupId), 'المجموعة غير موجودة');
    requireGroupAccess(actor, group);
    await store.put({ ...current, checkOutTime: dayjs().format('HH:mm'), updatedAt: new Date().toISOString() });
  });
}
