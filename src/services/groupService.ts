import { getDB } from '../data/database';
import { readByIndex } from '../data/readers';
import { writeTransaction } from '../data/transactions';
import type { Attendance, Group, Student } from '../domain/models';
import { withBillingTransaction } from './billing/unitOfWork';

/**
 * تحديث حالة المجموعة تلقائياً بناءً على عدد الطلاب:
 * - open → full عند اكتمال العدد
 * - full → open عند توفر مكان
 * (المجموعات المنتهية 'ended' لا تتغير تلقائياً)
 */
export async function syncGroupStatus(groupId: string): Promise<void> {
  return withBillingTransaction(unit => unit.syncGroup(groupId));
}

export async function getGroupAttendanceForDate(groupId: string, date: string): Promise<Attendance[]> {
  try {
    const db = await getDB();
    const all = await db.getAllFromIndex('attendance', 'by-groupDate', [groupId, date]);
    return all as Attendance[];
  } catch {
    const all = await readByIndex<Attendance>('attendance', 'by-groupId', groupId);
    return all.filter(a => a.date === date);
  }
}

/** Preserve the catalog's existing cleanup of missing/deleted student memberships. */
export async function cleanGroupMembers(groups: readonly Group[], _students: readonly Student[]): Promise<Group[]> {
  return writeTransaction(['groups', 'students'], async tx => {
    const activeIds = new Set((await tx.objectStore('students').getAll()).filter(row => !row.deleted).map(row => row.id));
    const result: Group[] = [];
    for (const requested of groups) {
      const fresh = await tx.objectStore('groups').get(requested.id);
      if (!fresh || fresh.deleted) continue;
      const studentIds = fresh.studentIds.filter(id => activeIds.has(id));
      if (studentIds.length === fresh.studentIds.length) { result.push(fresh); continue; }
      const updated: Group = {
        ...fresh, studentIds, updatedAt: new Date().toISOString(),
        status: fresh.status === 'ended' ? 'ended' : studentIds.length >= fresh.maxStudents ? 'full' : 'open'
      };
      await tx.objectStore('groups').put(updated);
      result.push(updated);
    }
    return result;
  });
}
