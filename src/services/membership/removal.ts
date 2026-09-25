import { requireLive } from '../../domain/validation';
import type { BillingUnit } from '../billing/unitOfWork';
import { detachInUnit } from './enrollment';

/** Resolve all real links, not just one potentially stale denormalized array. Never delete receipts/history. */
export async function removeStudentInUnit(unit: BillingUnit, id: string, actorId: string) {
  const student = await unit.get('students', id);
  if (!student) return null;
  const [groups, enrollments, installments] = await Promise.all([
    unit.all('groups'), unit.index('enrollments', 'by-studentId', id), unit.index('installments', 'by-studentId', id),
  ]);
  const groupIds = new Set([...(student.enrolledGroups || []),
  ...groups.filter(row => row.studentIds.includes(id)).map(row => row.id),
  ...enrollments.filter(row => row.status === 'active').map(row => row.groupId),
  ...installments.map(row => row.groupId),
  ]);
  for (const groupId of groupIds) await detachInUnit(unit, id, groupId, 'حذف الطالب', { allowLegacy: true, recalculate: false });
  await unit.recalculate(id);
  const fresh = requireLive(await unit.get('students', id), 'الطالب غير موجود');
  const now = new Date().toISOString();
  const tombstone = { ...fresh, deleted: true, deletedAt: now, deletedBy: actorId, updatedAt: now };
  await unit.put('students', tombstone);
  return student;
}

export async function removeGroupInUnit(unit: BillingUnit, id: string, actorId: string) {
  const group = requireLive(await unit.get('groups', id), 'المجموعة غير موجودة');
  const [students, enrollments, installments] = await Promise.all([
    unit.all('students'), unit.index('enrollments', 'by-groupId', id), unit.all('installments'),
  ]);
  const studentIds = new Set([...group.studentIds,
  ...students.filter(row => row.enrolledGroups?.includes(id)).map(row => row.id),
  ...enrollments.filter(row => row.status === 'active').map(row => row.studentId),
  ...installments.filter(row => row.groupId === id).map(row => row.studentId),
  ]);
  for (const studentId of studentIds) await detachInUnit(unit, studentId, id, 'حذف المجموعة', { allowLegacy: true });
  const fresh = requireLive(await unit.get('groups', id), 'المجموعة غير موجودة');
  const now = new Date().toISOString();
  const tombstone = { ...fresh, deleted: true, deletedAt: now, deletedBy: actorId, updatedAt: now };
  await unit.put('groups', tombstone);
  return group;
}
