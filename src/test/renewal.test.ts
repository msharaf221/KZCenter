/**
 * اختبارات تجديد/استكمال الاشتراك:
 *  - renewalInfo (نقية): ساري / قرب ينتهي / منتهي + بداية التجديد المقترحة
 *  - buildMonthlyPlan مع startPeriodIndex/labelPrefix
 *  - renewEnrollment على القاعدة: الأقساط تكمّل الترقيم، المتبقي القديم بيفضل، الطالب المنتهي يرجع نشط
 *  - getRenewalCandidates: بيطلع اللي قرب ينتهي أو انتهى بس
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enrollStudent,
  unenrollStudent,
  renewEnrollment,
  getRenewalCandidates,
  getStudentBalance,
  getStudentInstallments,
  dbAdd,
  dbPut,
  dbGetById,
  dbGetByIndex,
  dbClearStore,
  generateId,
  Student,
  Group,
  Course,
  Enrollment,
  Installment,
  Payment,
} from '../lib/db';
import { renewalInfo, buildMonthlyPlan, type Installment as PureInstallment } from '../lib/billing';

const NOW = '2026-03-10T10:00:00.000Z';
const TODAY = '2026-03-10';

function inst(o: Partial<PureInstallment> = {}): PureInstallment {
  return {
    id: o.id || generateId(),
    studentId: 's1', groupId: 'g1',
    periodIndex: o.periodIndex ?? 1,
    periodLabel: o.periodLabel || 'الشهر 1',
    amount: o.amount ?? 500, paidAmount: o.paidAmount ?? 0,
    dueDate: o.dueDate || TODAY,
    status: o.status || 'pending',
    createdAt: NOW, updatedAt: NOW,
    deleted: o.deleted,
  };
}

describe('renewalInfo — حالة الاشتراك', () => {
  it('من غير أقساط → منتهي وبداية التجديد النهاردة', () => {
    const r = renewalInfo([], TODAY);
    expect(r.state).toBe('expired');
    expect(r.periods).toBe(0);
    expect(r.lastPeriodIndex).toBe(0);
    expect(r.nextStartDate).toBe(TODAY);
  });

  it('آخر قسط استحقاقه من شهرين → منتهي، وبداية التجديد النهاردة (مش من فترة الانقطاع)', () => {
    const r = renewalInfo([inst({ periodIndex: 1, dueDate: '2025-12-01' }), inst({ periodIndex: 2, dueDate: '2026-01-01' })], TODAY);
    expect(r.state).toBe('expired');
    expect(r.endDate).toBe('2026-02-01');
    expect(r.daysLeft).toBeLessThan(0);
    expect(r.lastPeriodIndex).toBe(2);
    expect(r.nextStartDate).toBe(TODAY);
  });

  it('آخر قسط استحقاقه من 25 يوم → باقي 5 أيام → قرب ينتهي، والتجديد يبدأ يوم الانتهاء', () => {
    const r = renewalInfo([inst({ dueDate: '2026-02-13' })], TODAY, 7);
    expect(r.state).toBe('expiring');
    expect(r.endDate).toBe('2026-03-13');
    expect(r.daysLeft).toBe(3);
    expect(r.nextStartDate).toBe('2026-03-13');
  });

  it('آخر قسط لسه قدام → ساري', () => {
    const r = renewalInfo([inst({ dueDate: '2026-03-01' }), inst({ periodIndex: 2, dueDate: '2026-04-01' })], TODAY, 7);
    expect(r.state).toBe('active');
    expect(r.endDate).toBe('2026-05-01');
    expect(r.nextStartDate).toBe('2026-05-01');
  });

  it('الأقساط الملغاة ما بتتحسبش', () => {
    const r = renewalInfo([
      inst({ periodIndex: 1, dueDate: '2026-01-01' }),
      inst({ periodIndex: 9, dueDate: '2026-09-01', status: 'cancelled' }),
    ], TODAY);
    expect(r.lastPeriodIndex).toBe(1);
    expect(r.state).toBe('expired');
  });
});

describe('buildMonthlyPlan — ترقيم يكمّل بعد الخطة القديمة', () => {
  it('startPeriodIndex و labelPrefix', () => {
    const plan = buildMonthlyPlan({ coursePrice: 500, durationMonths: 2, startDate: '2026-04-01', startPeriodIndex: 4, labelPrefix: 'تجديد 1' });
    expect(plan.map(p => p.periodIndex)).toEqual([4, 5]);
    expect(plan[0].periodLabel).toBe('تجديد 1 — الشهر 1 من 2');
    expect(plan.map(p => p.dueDate)).toEqual(['2026-04-01', '2026-05-01']);
  });

  it('الافتراضي لسه بيبدأ من 1 من غير بادئة (السلوك القديم)', () => {
    const plan = buildMonthlyPlan({ coursePrice: 500, durationMonths: 2, startDate: '2026-04-01' });
    expect(plan.map(p => p.periodIndex)).toEqual([1, 2]);
    expect(plan[0].periodLabel).toBe('الشهر 1 من 2');
  });
});

// ==================== على القاعدة ====================

async function seed(price = 500, durationMonths = 2) {
  const courseId = generateId();
  const groupId = generateId();
  const studentId = generateId();
  await dbAdd<Course>('courses', {
    id: courseId, name: 'إنجليزي', category: 'لغات', price, durationMonths,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId, name: 'إنجليزي أ', courseId, teacherId: 't1', schedule: [],
    maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Student>('students', {
    id: studentId, name: 'منى', age: 11, gender: 'female', parentPhone: '01000000000',
    status: 'active', totalPaid: 0, enrolledGroups: [], createdAt: NOW, updatedAt: NOW,
  });
  return { courseId, groupId, studentId };
}

/** يرجّع استحقاقات أقساط الطالب للماضي عشان الاشتراك يبقى منتهي */
async function ageInstallments(studentId: string, firstDue: string) {
  const list = (await dbGetByIndex<Installment>('installments', 'by-studentId', studentId))
    .sort((a, b) => a.periodIndex - b.periodIndex);
  for (let i = 0; i < list.length; i++) {
    const d = new Date(firstDue);
    d.setMonth(d.getMonth() + i);
    await dbPut('installments', { ...list[i], dueDate: d.toISOString().slice(0, 10) });
  }
}

beforeEach(async () => {
  for (const store of ['students', 'groups', 'courses', 'payments', 'enrollments', 'installments', 'teachers'] as const) {
    await dbClearStore(store);
  }
});

describe('renewEnrollment — تجديد على نفس التسجيل', () => {
  it('يفتح شهر جديد يكمّل الترقيم من غير ما يمس القديم', async () => {
    const { groupId, studentId } = await seed(500, 2);
    await enrollStudent(studentId, groupId, 500); // الشهر الأول مسدد بالكامل
    await ageInstallments(studentId, '2025-11-01'); // انتهى من زمان

    const r = await renewEnrollment({ studentId, groupId });
    expect(r.success).toBe(true);
    expect(r.cycle).toBe(1);
    expect(r.installmentsCreated).toBe(1);     // شهر واحد افتراضياً
    expect(r.monthlyPrice).toBe(500);

    const all = await getStudentInstallments(studentId);
    expect(all).toHaveLength(2);
    expect(all.map(i => i.periodIndex).sort((a, b) => a - b)).toEqual([1, 2]);
    const renewed = all.find(i => i.periodIndex === 2)!;
    expect(renewed.periodLabel.startsWith('تجديد 1 — شهر ')).toBe(true);
    // القديم مسدد زي ما هو
    expect(all.find(i => i.periodIndex === 1)?.status).toBe('paid');

    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(1000);
    expect(balance?.paid).toBe(500);
    expect(balance?.remaining).toBe(500);

    // لسه تسجيل واحد بس (مفيش تسجيل جديد)
    const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', studentId);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].status).toBe('active');
    expect(enrollments[0].renewalCount).toBe(1);
    expect(enrollments[0].renewals?.[0].months).toBe(1);
  });

  it('ممكن يفتح أكتر من شهر مرة واحدة', async () => {
    const { groupId, studentId } = await seed(500, 2);
    await enrollStudent(studentId, groupId, 500);
    await ageInstallments(studentId, '2025-11-01');

    const r = await renewEnrollment({ studentId, groupId, months: 3 });
    expect(r.installmentsCreated).toBe(3);
    const all = await getStudentInstallments(studentId);
    expect(all.map(i => i.periodIndex).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(all.filter(i => i.periodLabel.startsWith('تجديد 1 — الشهر'))).toHaveLength(3);
  });

  it('المتبقي من الدورة القديمة بيفضل، ودفعة التجديد بتروح للأقدم الأول', async () => {
    const { groupId, studentId } = await seed(500, 2);
    await enrollStudent(studentId, groupId, 200); // باقي 300 على الشهر الأول
    await ageInstallments(studentId, '2025-11-01');

    const r = await renewEnrollment({ studentId, groupId, months: 1, initialPayment: 500 });
    expect(r.success).toBe(true);

    const all = (await getStudentInstallments(studentId)).sort((a, b) => a.periodIndex - b.periodIndex);
    expect(all).toHaveLength(2);
    expect(all[0].paidAmount).toBe(500);  // القديم اتقفل من دفعة التجديد
    expect(all[1].paidAmount).toBe(200);  // والباقي راح للجديد
    expect(r.remainingAfter).toBe(300);

    const payments = await dbGetByIndex<Payment>('payments', 'by-studentId', studentId);
    const renewalPayment = payments.find(p => p.notes?.includes('تجديد'));
    expect(renewalPayment?.amount).toBe(500);
    expect(renewalPayment?.groupId).toBe(groupId);
    expect(renewalPayment?.receiptNo).toBeTruthy();
  });

  it('التجديد التاني يبقى دورة 2 ويكمّل الترقيم', async () => {
    const { groupId, studentId } = await seed(500, 1);
    await enrollStudent(studentId, groupId);
    await renewEnrollment({ studentId, groupId, startDate: '2026-04-10' });
    const r2 = await renewEnrollment({ studentId, groupId, startDate: '2026-05-10' });
    expect(r2.cycle).toBe(2);
    const all = await getStudentInstallments(studentId);
    expect(all.map(i => i.periodIndex).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(all.find(i => i.periodIndex === 3)?.periodLabel).toContain('تجديد 2');
  });

  it('بداية الخطة: بعد آخر قسط لو الاشتراك ساري، والنهاردة لو منتهي، أو تاريخ يدوي', async () => {
    const { groupId, studentId } = await seed(500, 1);
    await enrollStudent(studentId, groupId);
    // القسط الوحيد استحقاقه النهاردة → ينتهي بعد شهر → التجديد يبدأ بعد شهر
    const r = await renewEnrollment({ studentId, groupId });
    const first = (await getStudentInstallments(studentId)).find(i => i.periodIndex === 2)!;
    const expected = new Date(); expected.setMonth(expected.getMonth() + 1);
    expect(first.dueDate).toBe(expected.toISOString().slice(0, 10));
    expect(r.firstDueDate).toBe(first.dueDate);

    const r2 = await renewEnrollment({ studentId, groupId, startDate: '2026-09-01' });
    expect(r2.firstDueDate).toBe('2026-09-01');
  });

  it('بيحافظ على خصم التسجيل الأصلي إلا لو اتحدد تسعير جديد', async () => {
    const { groupId, studentId } = await seed(500, 1);
    await enrollStudent(studentId, groupId, 0, { discountPercent: 20 }); // 400
    const r1 = await renewEnrollment({ studentId, groupId });
    expect(r1.monthlyPrice).toBe(400);
    const r2 = await renewEnrollment({ studentId, groupId, priceOverride: 450, discountPercent: 0 });
    expect(r2.monthlyPrice).toBe(450);
  });

  it('الطالب المنتهي/المتوقف بيرجع نشط بالتجديد', async () => {
    const { groupId, studentId } = await seed(500, 1);
    await enrollStudent(studentId, groupId);
    const s = await dbGetById<Student>('students', studentId);
    await dbPut('students', { ...s!, status: 'ended' });

    const r = await renewEnrollment({ studentId, groupId });
    expect(r.success).toBe(true);
    expect((await dbGetById<Student>('students', studentId))?.status).toBe('active');
  });

  it('طالب خرج من المجموعة قبل كده → التجديد بيعيد تفعيل تسجيله ويرجّعه للمجموعة', async () => {
    const { groupId, studentId } = await seed(500, 2);
    await enrollStudent(studentId, groupId, 500);
    await unenrollStudent(studentId, groupId, 'سفر');
    expect((await dbGetById<Group>('groups', groupId))?.studentIds).not.toContain(studentId);

    const r = await renewEnrollment({ studentId, groupId, months: 1 });
    expect(r.success).toBe(true);

    const group = await dbGetById<Group>('groups', groupId);
    expect(group?.studentIds).toContain(studentId);
    const student = await dbGetById<Student>('students', studentId);
    expect(student?.enrolledGroups).toContain(groupId);
    const enrollments = await dbGetByIndex<Enrollment>('enrollments', 'by-studentId', studentId);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].status).toBe('active');

    // القسط 2 القديم كان اتلغى وقت الخروج → بيفضل ملغي، والدين الجديد = شهر واحد بس
    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(1000); // 500 مدفوع قديم + 500 تجديد
    expect(balance?.remaining).toBe(500);
  });

  it('يرفض لو الطالب ما اتسجلش أصلاً أو المجموعة منتهية', async () => {
    const { groupId, studentId } = await seed();
    const r = await renewEnrollment({ studentId, groupId });
    expect(r.success).toBe(false);
    expect(r.error).toContain('غير مسجل');

    await enrollStudent(studentId, groupId);
    const g = await dbGetById<Group>('groups', groupId);
    await dbPut('groups', { ...g!, status: 'ended' });
    const r2 = await renewEnrollment({ studentId, groupId });
    expect(r2.success).toBe(false);
    expect(r2.error).toContain('منتهية');
  });
});

describe('getRenewalCandidates — مين محتاج تجديد', () => {
  it('بيطلع المنتهي واللي قرب ينتهي بس، ومرتبين الأقدم انتهاءً الأول', async () => {
    const a = await seed(500, 1);
    await enrollStudent(a.studentId, a.groupId);
    await ageInstallments(a.studentId, '2025-10-01'); // منتهي من زمان

    const b = await seed(500, 3);
    await enrollStudent(b.studentId, b.groupId); // ساري لـ 3 شهور

    const c = await seed(500, 1);
    await enrollStudent(c.studentId, c.groupId);
    // ينتهي بعد 5 أيام
    const d = new Date(); d.setDate(d.getDate() + 5); d.setMonth(d.getMonth() - 1);
    await ageInstallments(c.studentId, d.toISOString().slice(0, 10));

    const rows = await getRenewalCandidates(7);
    expect(rows.map(r => r.studentId)).toEqual([a.studentId, c.studentId]);
    expect(rows[0].info.state).toBe('expired');
    expect(rows[1].info.state).toBe('expiring');
    expect(rows[0].groupName).toBe('إنجليزي أ');
    expect(rows[0].remaining).toBe(500);
  });

  it('بعد التجديد الطالب بيختفي من القائمة', async () => {
    const a = await seed(500, 1);
    await enrollStudent(a.studentId, a.groupId);
    await ageInstallments(a.studentId, '2025-10-01');
    expect(await getRenewalCandidates()).toHaveLength(1);
    await renewEnrollment({ studentId: a.studentId, groupId: a.groupId, months: 2 });
    expect(await getRenewalCandidates()).toHaveLength(0);
  });
});
