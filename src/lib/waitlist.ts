/**
 * قائمة الانتظار (Waitlist)
 *
 * لما مجموعة تكتمل، بدل ما الطالب يضيع من النظام بيتحط في قائمة انتظار:
 *  - أولوية بالترتيب
 *  - تنبيه لما يفتح مكان في المجموعة
 *  - ترقية بضغطة (بتسجّله فعلياً في المجموعة)
 */
import { dbAdd, dbGetAll, dbGetById, dbGetByIndex, dbPut, generateId, enrollStudent, syncGroupStatus } from './db';
import type { Group, WaitlistEntry } from './db';
import { dayjs } from './utils';

export async function getWaitlist(groupId?: string): Promise<WaitlistEntry[]> {
  const rows = groupId
    ? await dbGetByIndex<WaitlistEntry>('waitlist', 'by-groupId', groupId)
    : await dbGetAll<WaitlistEntry>('waitlist');

  return rows
    .filter(w => !w.deleted && w.status === 'waiting')
    .sort((a, b) => a.priority - b.priority || (a.addedAt || '').localeCompare(b.addedAt || ''));
}

export async function addToWaitlist(opts: {
  studentId: string;
  groupId: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string; entry?: WaitlistEntry }> {
  const [student, group] = await Promise.all([
    dbGetById('students', opts.studentId),
    dbGetById<Group>('groups', opts.groupId),
  ]);
  if (!student) return { success: false, error: 'الطالب غير موجود' };
  if (!group) return { success: false, error: 'المجموعة غير موجودة' };

  // منع التكرار
  const existing = await dbGetByIndex<WaitlistEntry>('waitlist', 'by-groupStudent', [opts.groupId, opts.studentId]);
  const dup = existing.find(e => !e.deleted && e.status === 'waiting');
  if (dup) return { success: false, error: 'الطالب موجود بالفعل في قائمة انتظار المجموعة دي' };

  const current = await getWaitlist(opts.groupId);
  const now = new Date().toISOString();
  const entry: WaitlistEntry = {
    id: generateId(),
    groupId: opts.groupId,
    studentId: opts.studentId,
    addedAt: now,
    priority: current.length + 1,
    notes: opts.notes,
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
  };
  await dbAdd('waitlist', entry);
  return { success: true, entry };
}

/** ترقية أول طالب في الانتظار (أو طالب محدد) وتسجيله فعلياً */
export async function promoteFromWaitlist(opts: {
  entryId: string;
  initialPayment?: number;
  startSession?: number;
}): Promise<{ success: boolean; error?: string }> {
  const entry = await dbGetById<WaitlistEntry>('waitlist', opts.entryId);
  if (!entry) return { success: false, error: 'قيد الانتظار غير موجود' };
  if (entry.status !== 'waiting') return { success: false, error: 'القيد مش في الانتظار' };

  // الحالة المخزّنة ممكن تكون قديمة (مثلاً المسؤول زوّد السعة والمجموعة لسه 'full')،
  // فبنزامنها الأول عشان القرار يكون مبني على العدد الفعلي مش على حالة منسية.
  await syncGroupStatus(entry.groupId);

  const group = await dbGetById<Group>('groups', entry.groupId);
  if (!group) return { success: false, error: 'المجموعة اتحذفت' };
  if (group.status === 'ended') return { success: false, error: 'المجموعة منتهية' };
  if ((group.studentIds || []).length >= group.maxStudents) {
    return { success: false, error: 'المجموعة لسه مكتملة — مفيش مكان فاضي' };
  }

  const result = await enrollStudent(entry.studentId, entry.groupId, opts.initialPayment, {
    startSession: opts.startSession,
  });
  if (!result.success) return { success: false, error: result.error };

  await dbPut('waitlist', { ...entry, status: 'enrolled', updatedAt: new Date().toISOString() });
  await resequence(entry.groupId);

  return { success: true };
}

export async function removeFromWaitlist(entryId: string, reason?: string): Promise<void> {
  const entry = await dbGetById<WaitlistEntry>('waitlist', entryId);
  if (!entry) return;
  await dbPut('waitlist', {
    ...entry,
    status: 'cancelled',
    notes: reason ? `${entry.notes || ''} — إلغاء: ${reason}`.trim() : entry.notes,
    updatedAt: new Date().toISOString(),
  });
  await resequence(entry.groupId);
}

/** إعادة ترقيم الأولويات بعد أي تغيير */
async function resequence(groupId: string): Promise<void> {
  const rows = await getWaitlist(groupId);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].priority !== i + 1) {
      await dbPut('waitlist', { ...rows[i], priority: i + 1, updatedAt: new Date().toISOString() });
    }
  }
}

/**
 * أماكن فتحت في مجموعات فيها قوائم انتظار → تنبيهات للترقية.
 * بتتعرض في الداشبورد وشاشة الجدول.
 */
export async function getPromotionOpportunities(): Promise<{
  groupId: string;
  groupName: string;
  freeSeats: number;
  waiting: WaitlistEntry[];
}[]> {
  const [groups, waiting] = await Promise.all([
    dbGetAll<Group>('groups'),
    getWaitlist(),
  ]);

  const out: { groupId: string; groupName: string; freeSeats: number; waiting: WaitlistEntry[] }[] = [];

  for (const g of groups) {
    if (g.deleted || g.status === 'ended') continue;
    const list = waiting.filter(w => w.groupId === g.id);
    if (list.length === 0) continue;
    const freeSeats = Math.max(0, g.maxStudents - (g.studentIds || []).length);
    if (freeSeats > 0) out.push({ groupId: g.id, groupName: g.name, freeSeats, waiting: list });
  }

  return out.sort((a, b) => b.freeSeats - a.freeSeats);
}

/** عدد اللي في الانتظار (للشارة) */
export async function waitlistCount(): Promise<number> {
  return (await getWaitlist()).length;
}

/** أقدم قيد انتظار في مجموعة (للرسائل) */
export async function oldestWaitingSince(groupId: string): Promise<string | null> {
  const rows = await getWaitlist(groupId);
  if (rows.length === 0) return null;
  return dayjs(rows[0].addedAt).format('YYYY/MM/DD');
}
