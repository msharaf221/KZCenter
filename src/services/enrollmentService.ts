import { readById, readByIndex } from '../data/readers';
import { requireRule, userErrorMessage } from '../domain/errors';
import type { EnrollOptions } from '../domain/membership/types';
import type { Enrollment, Student } from '../domain/models';
import { withBillingTransaction } from './billing/unitOfWork';
import { detachInUnit, enrollInUnit } from './membership/enrollment';
export type { EnrollOptions } from '../domain/membership/types';

/** Legacy single-membership API; larger commands compose the same work inside their own transaction. */
export async function enrollStudent(studentId: string, groupId: string, initialPayment?: number, opts?: EnrollOptions): Promise<{ success: boolean; error?: string; enrollmentId?: string; monthlyPrice?: number }> {
  try { return await withBillingTransaction(unit => enrollInUnit(unit, studentId, groupId, initialPayment, opts)); }
  catch (error) { return { success: false, error: userErrorMessage(error, 'تعذّر إتمام العملية. لم يتم حفظ تغييرات جزئية.') }; }
}
/** Register a selected group of students in one all-or-nothing billing transaction. */
export async function enrollStudentsInGroup(studentIds: string[], groupId: string, opts?: EnrollOptions): Promise<{ success: boolean; error?: string; enrolledCount?: number; studentIds?: string[] }> {
  try {
    requireRule(Array.isArray(studentIds) && studentIds.every(id => typeof id === 'string' && !!id.trim()), 'قائمة الطلاب غير صحيحة');
    requireRule(typeof groupId === 'string' && !!groupId.trim(), 'المجموعة غير صحيحة');
    const uniqueIds = [...new Set(studentIds)];
    requireRule(uniqueIds.length > 0, 'اختر طالباً واحداً على الأقل');
    return await withBillingTransaction(async unit => {
      for (const studentId of uniqueIds) await enrollInUnit(unit, studentId, groupId, undefined, opts);
      return { success: true as const, enrolledCount: uniqueIds.length, studentIds: uniqueIds };
    });
  } catch (error) {
    return { success: false, error: userErrorMessage(error, 'تعذّر إتمام التسجيل الجماعي. لم يتم حفظ تغييرات جزئية.') };
  }
}

export async function unenrollStudent(studentId: string, groupId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try { await withBillingTransaction(unit => detachInUnit(unit, studentId, groupId, reason)); return { success: true }; }
  catch (error) { return { success: false, error: userErrorMessage(error, 'تعذّر إتمام العملية. لم يتم حفظ تغييرات جزئية.') }; }
}

/**
 * جلب كل الطلاب المسجلين في مجموعة
 */
export async function getGroupStudents(groupId: string): Promise<Student[]> {
  const enrollments = await readByIndex<Enrollment>('enrollments', 'by-groupId', groupId);
  const activeStudentIds = enrollments.filter(e => e.status === 'active' && !e.deleted).map(e => e.studentId);

  const students: Student[] = [];
  for (const sid of activeStudentIds) {
    const student = await readById<Student>('students', sid);
    if (student && !student.deleted) {
      students.push(student);
    }
  }
  return students;
}
