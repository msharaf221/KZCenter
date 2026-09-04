/**
 * اختبارات قائمة الانتظار (Waitlist) — src/lib/waitlist.ts على IndexedDB فعلي
 *
 * لما مجموعة تكتمل، بدل ما الطالب يضيع بيتحط في قائمة انتظار بأولوية،
 * ولما يفتح مكان بيتفعّل بضغطة (وبيتسجّل فعلياً بالأقساط).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWaitlist, addToWaitlist, promoteFromWaitlist, removeFromWaitlist,
  getPromotionOpportunities, waitlistCount, oldestWaitingSince,
} from '../lib/waitlist';
import {
  dbAdd, dbGetById, dbClearStore, dbGetAll, enrollStudent, generateId,
  type Student, type Group, type Course, type Enrollment,
} from '../lib/db';

const NOW = '2026-03-10T10:00:00.000Z';

let courseSeq = 0;

async function seedGroup(o: { maxStudents?: number; status?: Group['status']; name?: string } = {}) {
  const courseId = generateId();
  const groupId = generateId();
  courseSeq++;

  await dbAdd<Course>('courses', {
    id: courseId, name: `كورس ${courseSeq}`, category: 'علوم', price: 800, durationMonths: 3,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId,
    name: o.name || `مجموعة ${courseSeq}`,
    courseId,
    teacherId: 't1',
    schedule: [],
    maxStudents: o.maxStudents ?? 2,
    status: o.status || 'open',
    studentIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });

  return { courseId, groupId };
}

async function seedStudent(name = 'طالب', phone = '01000000000'): Promise<string> {
  const id = generateId();
  await dbAdd<Student>('students', {
    id, name, age: 12, gender: 'male', parentPhone: phone,
    status: 'active', totalPaid: 0, enrolledGroups: [], createdAt: NOW, updatedAt: NOW,
  });
  return id;
}

/** يملا المجموعة لحد ما تكمل (عشان نجرّب الإدخال في قائمة الانتظار) */
async function fillGroup(groupId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const sid = await seedStudent(`طالب ${i + 1}`, `0100000000${i}`);
    await enrollStudent(sid, groupId);
    ids.push(sid);
  }
  return ids;
}

beforeEach(async () => {
  for (const store of ['students', 'groups', 'courses', 'payments', 'enrollments', 'installments', 'waitlist'] as const) {
    await dbClearStore(store);
  }
});

describe('addToWaitlist', () => {
  it('بيضيف قيد انتظار بأولوية متسلسلة', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent('أحمد');
    const s2 = await seedStudent('منى');

    const r1 = await addToWaitlist({ studentId: s1, groupId });
    const r2 = await addToWaitlist({ studentId: s2, groupId });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r1.entry?.priority).toBe(1);
    expect(r2.entry?.priority).toBe(2);

    const list = await getWaitlist(groupId);
    expect(list).toHaveLength(2);
    expect(list[0].studentId).toBe(s1);
    expect(list[1].studentId).toBe(s2);
  });

  it('بيحفظ الحالة waiting وتاريخ الإضافة', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const r = await addToWaitlist({ studentId: s1, groupId });

    expect(r.entry?.status).toBe('waiting');
    expect(r.entry?.addedAt).toBeTruthy();
    expect(r.entry?.groupId).toBe(groupId);
    expect(r.entry?.studentId).toBe(s1);
  });

  it('بيحفظ الملاحظات', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const r = await addToWaitlist({ studentId: s1, groupId, notes: 'طلب ولي الأمر ميعاد تاني' });
    expect(r.entry?.notes).toBe('طلب ولي الأمر ميعاد تاني');
  });

  it('منع التكرار: نفس الطالب في نفس المجموعة', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();

    expect((await addToWaitlist({ studentId: s1, groupId })).success).toBe(true);
    const dup = await addToWaitlist({ studentId: s1, groupId });
    expect(dup.success).toBe(false);
    expect(dup.error).toContain('بالفعل');
    expect(await getWaitlist(groupId)).toHaveLength(1);
  });

  it('نفس الطالب يقدر ينتظر في مجموعة تانية', async () => {
    const g1 = await seedGroup();
    const g2 = await seedGroup();
    const s1 = await seedStudent();

    expect((await addToWaitlist({ studentId: s1, groupId: g1.groupId })).success).toBe(true);
    expect((await addToWaitlist({ studentId: s1, groupId: g2.groupId })).success).toBe(true);
    expect(await waitlistCount()).toBe(2);
  });

  it('طالب مش موجود = خطأ', async () => {
    const { groupId } = await seedGroup();
    const r = await addToWaitlist({ studentId: 'مش-موجود', groupId });
    expect(r.success).toBe(false);
    expect(r.error).toContain('غير موجود');
  });

  it('مجموعة مش موجودة = خطأ', async () => {
    const s1 = await seedStudent();
    const r = await addToWaitlist({ studentId: s1, groupId: 'مش-موجود' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('غير موجودة');
  });

  it('الإضافة ممكنة حتى لو المجموعة مكتملة (ده الغرض منها)', async () => {
    const { groupId } = await seedGroup({ maxStudents: 1 });
    await fillGroup(groupId, 1);
    const extra = await seedStudent('زيادة');

    const r = await addToWaitlist({ studentId: extra, groupId });
    expect(r.success).toBe(true);
    expect(await getWaitlist(groupId)).toHaveLength(1);
  });
});

describe('getWaitlist', () => {
  it('بيفلتر حسب المجموعة', async () => {
    const g1 = await seedGroup();
    const g2 = await seedGroup();
    await addToWaitlist({ studentId: await seedStudent('أ'), groupId: g1.groupId });
    await addToWaitlist({ studentId: await seedStudent('ب'), groupId: g2.groupId });

    expect(await getWaitlist(g1.groupId)).toHaveLength(1);
    expect(await getWaitlist(g2.groupId)).toHaveLength(1);
    expect(await getWaitlist()).toHaveLength(2);
  });

  it('الترتيب حسب الأولوية ثم تاريخ الإضافة', async () => {
    const { groupId } = await seedGroup();
    for (const n of ['أ', 'ب', 'ج']) {
      await addToWaitlist({ studentId: await seedStudent(n), groupId });
    }
    const list = await getWaitlist(groupId);
    expect(list.map(w => w.priority)).toEqual([1, 2, 3]);
  });

  it('ما يرجّعش الملغي أو المفعّل', async () => {
    const { groupId } = await seedGroup({ maxStudents: 5 });
    const s1 = await seedStudent('أ');
    const s2 = await seedStudent('ب');
    const s3 = await seedStudent('ج');
    const e1 = await addToWaitlist({ studentId: s1, groupId });
    const e2 = await addToWaitlist({ studentId: s2, groupId });
    await addToWaitlist({ studentId: s3, groupId });

    await removeFromWaitlist(e2.entry!.id, 'اعتذر');
    await promoteFromWaitlist({ entryId: e1.entry!.id });

    const list = await getWaitlist(groupId);
    expect(list).toHaveLength(1);
    expect(list[0].studentId).toBe(s3);
  });

  it('المحذوف (سلة المحذوفات) ما يظهرش', async () => {
    const { groupId } = await seedGroup();
    const r = await addToWaitlist({ studentId: await seedStudent(), groupId });
    const db = await (await import('../lib/db')).getDB();
    const entry = await db.get('waitlist', r.entry!.id);
    await db.put('waitlist', { ...entry, deleted: true });

    expect(await getWaitlist(groupId)).toHaveLength(0);
  });

  it('قائمة فاضية', async () => {
    expect(await getWaitlist()).toEqual([]);
    expect(await getWaitlist('مجموعة-مش-موجودة')).toEqual([]);
  });
});

describe('promoteFromWaitlist — الترقية', () => {
  it('بيسجّل الطالب فعلياً في المجموعة', async () => {
    const { groupId } = await seedGroup({ maxStudents: 2 });
    const s1 = await seedStudent('أحمد');
    const entry = await addToWaitlist({ studentId: s1, groupId });

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(r.success).toBe(true);

    const group = await dbGetById<Group>('groups', groupId);
    expect(group?.studentIds).toContain(s1);

    const enrollments = await dbGetAll<Enrollment>('enrollments');
    expect(enrollments.filter(e => e.studentId === s1 && e.status === 'active')).toHaveLength(1);
  });

  it('بيغيّر حالة القيد لـ enrolled ويخرجه من القائمة', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });

    await promoteFromWaitlist({ entryId: entry.entry!.id });

    const stored = await dbGetById<{ status: string }>('waitlist', entry.entry!.id);
    expect(stored?.status).toBe('enrolled');
    expect(await getWaitlist(groupId)).toHaveLength(0);
  });

  it('بيعدي الدفعة الأولى لو اتحددت', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id, initialPayment: 500 });
    expect(r.success).toBe(true);

    const student = await dbGetById<Student>('students', s1);
    expect(student?.totalPaid).toBe(500);
  });

  it('بيمرر رقم الحصة الأولى (التحاق في نص الكورس)', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id, startSession: 4 });
    expect(r.success).toBe(true);

    const [enrollment] = await dbGetAll<Enrollment>('enrollments');
    expect(enrollment.startSession).toBe(4);
  });

  it('بيعيد ترقيم الأولويات بعد الترقية', async () => {
    const { groupId } = await seedGroup({ maxStudents: 3 });
    const ids: string[] = [];
    for (const n of ['أ', 'ب', 'ج', 'د']) {
      const sid = await seedStudent(n);
      ids.push(sid);
      await addToWaitlist({ studentId: sid, groupId });
    }

    await promoteFromWaitlist({ entryId: (await getWaitlist(groupId))[0].id });
    const after = await getWaitlist(groupId);
    expect(after.map(w => w.priority)).toEqual([1, 2, 3]);
    expect(after[0].studentId).toBe(ids[1]);   // اللي كان الثاني بقى الأول
  });

  it('ممنوع لو المجموعة لسه مكتملة', async () => {
    const { groupId } = await seedGroup({ maxStudents: 1 });
    await fillGroup(groupId, 1);
    const waiting = await seedStudent('منتظر');
    const entry = await addToWaitlist({ studentId: waiting, groupId });

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(r.success).toBe(false);
    expect(r.error).toContain('مكتملة');

    // القيد لسه في الانتظار (ما اتحرقش)
    expect(await getWaitlist(groupId)).toHaveLength(1);
  });

  it('بيشتغل بعد ما يفتح مكان', async () => {
    const { groupId } = await seedGroup({ maxStudents: 1 });
    const [first] = await fillGroup(groupId, 1);
    const waiting = await seedStudent('منتظر');
    const entry = await addToWaitlist({ studentId: waiting, groupId });

    // المكان فتح: المجموعة وسّعت
    const group = await dbGetById<Group>('groups', groupId);
    const { dbPut } = await import('../lib/db');
    await dbPut('groups', { ...group!, maxStudents: 2 });

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(r.success).toBe(true);
    const after = await dbGetById<Group>('groups', groupId);
    expect(after?.studentIds).toEqual(expect.arrayContaining([first, waiting]));
  });

  it('قيد مش موجود = خطأ', async () => {
    const r = await promoteFromWaitlist({ entryId: 'مش-موجود' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('غير موجود');
  });

  it('قيد ملغي ما يترقّاش', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });
    await removeFromWaitlist(entry.entry!.id, 'اعتذر');

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(r.success).toBe(false);
    expect(r.error).toContain('مش في الانتظار');
  });

  it('قيد مفعّل ما يترقّاش مرتين', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });
    await promoteFromWaitlist({ entryId: entry.entry!.id });

    const again = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(again.success).toBe(false);
    expect(await dbGetAll<Enrollment>('enrollments')).toHaveLength(1);
  });

  it('مجموعة انتهت = خطأ', async () => {
    const { groupId } = await seedGroup({ status: 'ended' });
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(r.success).toBe(false);
    expect(r.error).toContain('منتهية');
  });

  it('مجموعة اتحذفت بعد الإضافة = خطأ واضح', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });

    const { dbSoftDelete } = await import('../lib/db');
    await dbSoftDelete('groups', groupId);
    const db = await (await import('../lib/db')).getDB();
    await db.delete('groups', groupId);

    const r = await promoteFromWaitlist({ entryId: entry.entry!.id });
    expect(r.success).toBe(false);
    expect(r.error).toContain('اتحذفت');
  });
});

describe('removeFromWaitlist', () => {
  it('بيخرج القيد من القائمة', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId });

    await removeFromWaitlist(entry.entry!.id);
    expect(await getWaitlist(groupId)).toHaveLength(0);
  });

  it('بيسجّل سبب الإلغاء في الملاحظات', async () => {
    const { groupId } = await seedGroup();
    const s1 = await seedStudent();
    const entry = await addToWaitlist({ studentId: s1, groupId, notes: 'أصلية' });

    await removeFromWaitlist(entry.entry!.id, 'الطالب اعتذر');
    const stored = await dbGetById<{ status: string; notes?: string }>('waitlist', entry.entry!.id);
    expect(stored?.status).toBe('cancelled');
    expect(stored?.notes).toContain('أصلية');
    expect(stored?.notes).toContain('الطالب اعتذر');
  });

  it('من غير سبب ما يكسرش', async () => {
    const { groupId } = await seedGroup();
    const entry = await addToWaitlist({ studentId: await seedStudent(), groupId });
    await removeFromWaitlist(entry.entry!.id);
    expect(await getWaitlist(groupId)).toHaveLength(0);
  });

  it('بيعيد ترقيم الباقيين', async () => {
    const { groupId } = await seedGroup();
    const ids: string[] = [];
    for (const n of ['أ', 'ب', 'ج']) {
      const sid = await seedStudent(n);
      ids.push(sid);
      await addToWaitlist({ studentId: sid, groupId });
    }

    const list = await getWaitlist(groupId);
    await removeFromWaitlist(list[0].id);   // شيل الأول

    const after = await getWaitlist(groupId);
    expect(after).toHaveLength(2);
    expect(after.map(w => w.priority)).toEqual([1, 2]);
    expect(after[0].studentId).toBe(ids[1]);
  });

  it('قيد مش موجود = مفيش خطأ', async () => {
    await expect(removeFromWaitlist('مش-موجود')).resolves.toBeUndefined();
  });

  it('الإلغاء ما يحذفش السجل (يصلح للمراجعة)', async () => {
    const { groupId } = await seedGroup();
    const entry = await addToWaitlist({ studentId: await seedStudent(), groupId });
    await removeFromWaitlist(entry.entry!.id);
    expect(await dbGetById('waitlist', entry.entry!.id)).toBeTruthy();
  });
});

describe('getPromotionOpportunities — أماكن فتحت', () => {
  it('بيرجع المجموعات اللي فيها مكان وفيها منتظرين', async () => {
    const { groupId } = await seedGroup({ maxStudents: 3, name: 'الأولى' });
    await fillGroup(groupId, 1);            // مكان واحد مستخدم → 2 فاضيين
    await addToWaitlist({ studentId: await seedStudent('أ'), groupId });

    const opps = await getPromotionOpportunities();
    expect(opps).toHaveLength(1);
    expect(opps[0].groupId).toBe(groupId);
    expect(opps[0].groupName).toBe('الأولى');
    expect(opps[0].freeSeats).toBe(2);
    expect(opps[0].waiting).toHaveLength(1);
  });

  it('مجموعة مكتملة من غير أماكن = مفيش فرصة', async () => {
    const { groupId } = await seedGroup({ maxStudents: 1 });
    await fillGroup(groupId, 1);
    await addToWaitlist({ studentId: await seedStudent(), groupId });

    expect(await getPromotionOpportunities()).toHaveLength(0);
  });

  it('مجموعة فيها أماكن لكن مفيش منتظرين = مفيش فرصة', async () => {
    await seedGroup({ maxStudents: 5 });
    expect(await getPromotionOpportunities()).toHaveLength(0);
  });

  it('المجموعة المنتهية والمحذوفة خارج الحساب', async () => {
    const ended = await seedGroup({ maxStudents: 3, status: 'ended' });
    await addToWaitlist({ studentId: await seedStudent(), groupId: ended.groupId });

    const deleted = await seedGroup({ maxStudents: 3 });
    await addToWaitlist({ studentId: await seedStudent(), groupId: deleted.groupId });
    const { dbSoftDelete } = await import('../lib/db');
    await dbSoftDelete('groups', deleted.groupId);

    expect(await getPromotionOpportunities()).toHaveLength(0);
  });

  it('مرتّب من الأكثر أماكن فاضية', async () => {
    const g1 = await seedGroup({ maxStudents: 2, name: 'ضيقة' });
    const g2 = await seedGroup({ maxStudents: 5, name: 'واسعة' });
    await addToWaitlist({ studentId: await seedStudent('أ'), groupId: g1.groupId });
    await addToWaitlist({ studentId: await seedStudent('ب'), groupId: g2.groupId });

    const opps = await getPromotionOpportunities();
    expect(opps.map(o => o.groupName)).toEqual(['واسعة', 'ضيقة']);
  });

  it('منتظرين كتير في نفس المجموعة', async () => {
    const { groupId } = await seedGroup({ maxStudents: 4 });
    for (const n of ['أ', 'ب', 'ج']) {
      await addToWaitlist({ studentId: await seedStudent(n), groupId });
    }
    const [opp] = await getPromotionOpportunities();
    expect(opp.freeSeats).toBe(4);
    expect(opp.waiting).toHaveLength(3);
  });
});

describe('waitlistCount + oldestWaitingSince', () => {
  it('العدد الإجمالي للمنتظرين', async () => {
    expect(await waitlistCount()).toBe(0);
    const g1 = await seedGroup();
    const g2 = await seedGroup();
    await addToWaitlist({ studentId: await seedStudent('أ'), groupId: g1.groupId });
    await addToWaitlist({ studentId: await seedStudent('ب'), groupId: g1.groupId });
    await addToWaitlist({ studentId: await seedStudent('ج'), groupId: g2.groupId });

    expect(await waitlistCount()).toBe(3);
  });

  it('العدد بينزل بعد الترقية والإلغاء', async () => {
    const { groupId } = await seedGroup();
    const e1 = await addToWaitlist({ studentId: await seedStudent('أ'), groupId });
    const e2 = await addToWaitlist({ studentId: await seedStudent('ب'), groupId });
    expect(await waitlistCount()).toBe(2);

    await promoteFromWaitlist({ entryId: e1.entry!.id });
    expect(await waitlistCount()).toBe(1);

    await removeFromWaitlist(e2.entry!.id);
    expect(await waitlistCount()).toBe(0);
  });

  it('أقدم قيد انتظار بصيغة تاريخ', async () => {
    const { groupId } = await seedGroup();
    await addToWaitlist({ studentId: await seedStudent('أ'), groupId });
    expect(await oldestWaitingSince(groupId)).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  it('مفيش منتظرين = null', async () => {
    const { groupId } = await seedGroup();
    expect(await oldestWaitingSince(groupId)).toBeNull();
  });

  it('الملغي ما يحسبش كأقدم منتظر', async () => {
    const { groupId } = await seedGroup();
    const e1 = await addToWaitlist({ studentId: await seedStudent('أ'), groupId });
    await addToWaitlist({ studentId: await seedStudent('ب'), groupId });
    await removeFromWaitlist(e1.entry!.id);

    const date = await oldestWaitingSince(groupId);
    expect(date).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(await getWaitlist(groupId)).toHaveLength(1);
  });
});
