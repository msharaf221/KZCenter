/**
 * اختبارات مسار المستحقات الكامل على قاعدة البيانات الفعلية (IndexedDB):
 * تسجيل طالب → توليد الأقساط → دفع جزئي → دفع المتبقي → حذف دفعة → خروج من المجموعة
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  enrollStudent,
  unenrollStudent,
  getStudentBalance,
  getStudentInstallments,
  payStudentRemaining,
  recordInstallmentPayment,
  transferStudent,
  getTransferHistory,
  rebuildInstallmentsFromPayments,
  markOverdueInstallments,
  migrateInstallments,
  dbAdd,
  dbPut,
  dbSoftDelete,
  dbGetById,
  dbGetByIndex,
  dbClearStore,
  generateId,
  Student,
  Group,
  Course,
  Payment,
  Installment,
} from '../lib/db';

const NOW = '2026-03-10T10:00:00.000Z';

async function seed(price = 800, durationMonths = 3) {
  const courseId = generateId();
  const groupId = generateId();
  const studentId = generateId();

  await dbAdd<Course>('courses', {
    id: courseId, name: 'رياضيات', category: 'علوم', price, durationMonths,
    icon: '📚', color: '#6366f1', levels: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Group>('groups', {
    id: groupId, name: 'مجموعة أ', courseId, teacherId: 't1', schedule: [],
    maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
  });
  await dbAdd<Student>('students', {
    id: studentId, name: 'أحمد محمد', age: 12, gender: 'male', parentPhone: '01000000000',
    status: 'active', totalPaid: 0, enrolledGroups: [], createdAt: NOW, updatedAt: NOW,
  });

  return { courseId, groupId, studentId };
}

beforeEach(async () => {
  for (const store of ['students', 'groups', 'courses', 'payments', 'enrollments', 'installments'] as const) {
    await dbClearStore(store);
  }
});

describe('توليد الأقساط عند التسجيل', () => {
  it('يسجّل قسط شهري لكل شهر من مدة الكورس', async () => {
    const { groupId, studentId } = await seed(800, 3);
    const result = await enrollStudent(studentId, groupId);
    expect(result.success).toBe(true);

    const installments = await getStudentInstallments(studentId);
    expect(installments).toHaveLength(3);
    expect(installments.map(i => i.amount)).toEqual([800, 800, 800]);
    expect(installments.every(i => i.paidAmount === 0)).toBe(true);

    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(2400);
    expect(balance?.paid).toBe(0);
    expect(balance?.remaining).toBe(2400);
    expect(balance?.groups[0].groupName).toBe('مجموعة أ');

    const student = await dbGetById<Student>('students', studentId);
    expect(student?.totalOwed).toBe(2400);
    expect(student?.totalPaid).toBe(0);
  });

  it('الدفعة الأولى عند التسجيل تتوزع على الأقساط الأقدم', async () => {
    const { groupId, studentId } = await seed(800, 3);
    await enrollStudent(studentId, groupId, 1000);

    const installments = await getStudentInstallments(studentId);
    expect(installments[0].paidAmount).toBe(800);
    expect(installments[0].status).toBe('paid');
    expect(installments[1].paidAmount).toBe(200);
    expect(installments[1].status).toBe('partial');
    expect(installments[2].paidAmount).toBe(0);

    const balance = await getStudentBalance(studentId);
    expect(balance?.paid).toBe(1000);
    expect(balance?.remaining).toBe(1400);
  });
});

describe('الدفع الجزئي ودفع المتبقي', () => {
  it('دفعة جزئية تقلل المتبقي من غير ما تقفل كل الأقساط', async () => {
    const { groupId, studentId } = await seed(800, 3);
    await enrollStudent(studentId, groupId, 500);

    const result = await recordInstallmentPayment({ studentId, amount: 300 });
    expect(result.success).toBe(true);
    expect(result.remainingAfter).toBe(1600);

    const balance = await getStudentBalance(studentId);
    expect(balance?.paid).toBe(800);
    expect(balance?.remaining).toBe(1600);
    expect(balance?.unpaidCount).toBe(2);   // القسط الأول اتقفل، باقي 2
  });

  it('payStudentRemaining يسدد الباقي كله ويصفّر المتبقي', async () => {
    const { groupId, studentId } = await seed(800, 3);
    await enrollStudent(studentId, groupId, 500);

    const result = await payStudentRemaining(studentId);
    expect(result.success).toBe(true);
    expect(result.payment?.amount).toBe(1900);
    expect(result.remainingAfter).toBe(0);

    const balance = await getStudentBalance(studentId);
    expect(balance?.remaining).toBe(0);
    expect(balance?.groups[0].installments.every(i => i.status === 'paid')).toBe(true);
  });

  it('ما فيش متبقي → رفض الدفع', async () => {
    const { groupId, studentId } = await seed(800, 1);
    await enrollStudent(studentId, groupId, 800);
    const result = await payStudentRemaining(studentId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('لا يوجد مبلغ متبقٍ');
  });

  it('يرفض مبلغ صفر أو سالب', async () => {
    const { groupId, studentId } = await seed(800, 1);
    await enrollStudent(studentId, groupId);
    expect((await recordInstallmentPayment({ studentId, amount: 0 })).success).toBe(false);
    expect((await recordInstallmentPayment({ studentId, amount: -50 })).success).toBe(false);
  });

  it('الدفع على مجموعة محددة ما يمسّش مجموعات تانية', async () => {
    const { groupId, studentId } = await seed(800, 2);
    await enrollStudent(studentId, groupId);

    // مجموعة تانية لنفس الطالب (نفس الكورس، مدرس مختلف)
    const groupId2 = generateId();
    const firstGroup = await dbGetById<Group>('groups', groupId);
    await dbAdd<Group>('groups', {
      id: groupId2, name: 'مجموعة ب', courseId: firstGroup!.courseId, teacherId: 't2', schedule: [],
      maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
    });
    await enrollStudent(studentId, groupId2);

    await recordInstallmentPayment({ studentId, groupId, amount: 800 });

    const balance = await getStudentBalance(studentId);
    const g1 = balance?.groups.find(g => g.groupId === groupId);
    const g2 = balance?.groups.find(g => g.groupId === groupId2);
    expect(g1?.remaining).toBe(800);   // من 1600 → 800
    expect(g2?.remaining).toBe(1600);  // ما اتلمستش
  });
});

describe('حذف وتعديل الدفعات', () => {
  it('حذف دفعة مسددة يرجّع المتبقي على الأقساط', async () => {
    const { groupId, studentId } = await seed(800, 2);
    await enrollStudent(studentId, groupId, 1000);
    expect((await getStudentBalance(studentId))?.remaining).toBe(600);

    const payments = await dbGetByIndex<Payment>('payments', 'by-studentId', studentId);
    expect(payments).toHaveLength(1);

    await dbSoftDelete('payments', payments[0].id);
    await rebuildInstallmentsFromPayments(studentId);

    const balance = await getStudentBalance(studentId);
    expect(balance?.paid).toBe(0);
    expect(balance?.remaining).toBe(1600);
    const installments = await getStudentInstallments(studentId);
    expect(installments.every(i => i.paidAmount === 0)).toBe(true);
  });
});

describe('الخروج من المجموعة', () => {
  it('يلغي الأقساط غير المسددة ويسقط الدين', async () => {
    const { groupId, studentId } = await seed(800, 3);
    await enrollStudent(studentId, groupId, 800);
    expect((await getStudentBalance(studentId))?.remaining).toBe(1600);

    await unenrollStudent(studentId, groupId, 'سفر');

    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(800);        // القسط المدفوع بس
    expect(balance?.remaining).toBe(0);
    const cancelled = (await getStudentInstallments(studentId)).filter(i => i.status === 'cancelled');
    expect(cancelled).toHaveLength(2);
  });
});

describe('التأخير', () => {
  it('markOverdueInstallments يعلّم الأقساط اللي فات استحقاقها', async () => {
    const { groupId, studentId } = await seed(800, 3);
    await enrollStudent(studentId, groupId);

    // نرجّع استحقاق القسط الأول للماضي
    const installments = await dbGetByIndex<Installment>('installments', 'by-studentId', studentId);
    const first = installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const { dbPut } = await import('../lib/db');
    await dbPut('installments', { ...first, dueDate: '2020-01-01' });

    const updated = await markOverdueInstallments();
    expect(updated).toBeGreaterThanOrEqual(1);

    const balance = await getStudentBalance(studentId);
    expect(balance?.overdueCount).toBe(1);
    expect(balance?.overdueAmount).toBe(800);
  });
});

describe('ترحيل البيانات القديمة', () => {
  it('يولّد أقساط للتسجيلات الموجودة ويوزع عليها المدفوع القديم', async () => {
    const courseId = generateId();
    const groupId = generateId();
    const studentId = generateId();

    await dbAdd<Course>('courses', {
      id: courseId, name: 'علوم', category: 'علوم', price: 500, durationMonths: 2,
      icon: '🔬', color: '#22c55e', levels: [], createdAt: NOW, updatedAt: NOW,
    });
    await dbAdd<Group>('groups', {
      id: groupId, name: 'علوم أ', courseId, teacherId: 't1', schedule: [],
      maxStudents: 20, status: 'open', studentIds: [studentId], createdAt: NOW, updatedAt: NOW,
    });
    await dbAdd<Student>('students', {
      id: studentId, name: 'سارة', age: 14, gender: 'female', parentPhone: '01011111111',
      status: 'active', totalPaid: 500, totalOwed: 1000, enrolledGroups: [groupId],
      createdAt: NOW, updatedAt: NOW,
    });
    // تسجيل قديم + دفعة قديمة من غير ربط بأقساط
    await dbAdd('enrollments', {
      id: generateId(), studentId, groupId, status: 'active', enrolledAt: NOW,
      initialPayment: 500, createdAt: NOW, updatedAt: NOW,
    });
    await dbAdd<Payment>('payments', {
      id: generateId(), studentId, courseId, amount: 500, type: 'subscription',
      status: 'paid', date: '2026-01-10', createdAt: NOW, updatedAt: NOW,
    });

    const report = await migrateInstallments();
    expect(report.enrollmentsProcessed).toBe(1);
    expect(report.installmentsCreated).toBe(2);
    expect(report.studentsRecalculated).toBe(1);

    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(1000);
    expect(balance?.paid).toBe(500);
    expect(balance?.remaining).toBe(500);

    // التشغيل التاني ما يكررش الأقساط
    const second = await migrateInstallments();
    expect(second.installmentsCreated).toBe(0);
    expect((await getStudentInstallments(studentId))).toHaveLength(2);
  });
});

describe('الالتحاق في نص الكورس (التسعير بالحصص)', () => {
  it('الالتحاق من الحصة التالتة بيحاسب على 6 حصص في الشهر الأول', async () => {
    const { groupId, studentId } = await seed(800, 3);
    await enrollStudent(studentId, groupId, 0, { startSession: 3 });

    const installments = await getStudentInstallments(studentId);
    expect(installments.map(i => i.amount)).toEqual([600, 800, 800]);
    expect((await getStudentBalance(studentId))?.owed).toBe(2200);
  });

  it('الالتحاق من آخر حصة بيحاسب على حصة واحدة', async () => {
    const { groupId, studentId } = await seed(800, 1);
    await enrollStudent(studentId, groupId, 0, { startSession: 8 });
    expect((await getStudentBalance(studentId))?.owed).toBe(100);
  });

  it('startSession = 1 ما يغيّرش السعر (الشهر كامل)', async () => {
    const { groupId, studentId } = await seed(800, 1);
    await enrollStudent(studentId, groupId, 0, { startSession: 1 });
    expect((await getStudentBalance(studentId))?.owed).toBe(800);
  });
});

describe('التحويل بين المجموعات/المدرسين', () => {
  async function seedSecondGroup(price = 800, durationMonths = 3) {
    const base = await seed(price, durationMonths);
    const firstGroup = await dbGetById<Group>('groups', base.groupId);
    const groupId2 = generateId();
    await dbAdd<Group>('groups', {
      id: groupId2, name: 'مجموعة ب', courseId: firstGroup!.courseId, teacherId: 't2', schedule: [],
      maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
    });
    return { ...base, groupId2 };
  }

  it('بيحوّل التعليم ويلغي أقساط المجموعة القديمة ويرحّل المدفوع', async () => {
    const { groupId, groupId2, studentId } = await seedSecondGroup(800, 3);
    await enrollStudent(studentId, groupId, 1000);
    expect((await getStudentBalance(studentId))?.remaining).toBe(1400);

    const result = await transferStudent({
      studentId, fromGroupId: groupId, toGroupId: groupId2, reason: 'تغيير المدرس',
    });
    expect(result.success).toBe(true);
    expect(result.credit).toBe(1000);
    expect(result.remainingBefore).toBe(1400);
    expect(result.remainingAfter).toBe(1400);   // نفس السعر → نفس المتبقي

    const balance = await getStudentBalance(studentId);
    expect(balance?.groups).toHaveLength(1);
    expect(balance?.groups[0].groupId).toBe(groupId2);
    expect(balance?.owed).toBe(2400);
    expect(balance?.paid).toBe(1000);

    // القوائم المتطبيعة اتحدثت في الاتجاهين
    const student = await dbGetById<Student>('students', studentId);
    expect(student?.enrolledGroups).toEqual([groupId2]);
    expect((await dbGetById<Group>('groups', groupId))?.studentIds).not.toContain(studentId);
    expect((await dbGetById<Group>('groups', groupId2))?.studentIds).toContain(studentId);
  });

  it('لو المجموعة الجديدة أغلى، الفرق يظهر كمتبقي', async () => {
    const { groupId, studentId } = await seed(800, 1);
    const course2 = generateId();
    const groupId2 = generateId();
    await dbAdd<Course>('courses', {
      id: course2, name: 'فيزياء', category: 'علوم', price: 1200, durationMonths: 1,
      icon: '⚛️', color: '#3b82f6', levels: [], createdAt: NOW, updatedAt: NOW,
    });
    await dbAdd<Group>('groups', {
      id: groupId2, name: 'فيزياء أ', courseId: course2, teacherId: 't2', schedule: [],
      maxStudents: 20, status: 'open', studentIds: [], createdAt: NOW, updatedAt: NOW,
    });

    await enrollStudent(studentId, groupId, 800);
    expect((await getStudentBalance(studentId))?.remaining).toBe(0);

    const result = await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId2 });
    expect(result.credit).toBe(800);
    expect(result.remainingAfter).toBe(400);    // 1200 - 800
  });

  it('بيسجل التحويل في سجل التحويلات', async () => {
    const { groupId, groupId2, studentId } = await seedSecondGroup(800, 1);
    await enrollStudent(studentId, groupId);
    await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId2, reason: 'تغيير المدرس' });

    const history = await getTransferHistory(studentId);
    expect(history).toHaveLength(1);
    expect(history[0].fromGroupName).toBe('مجموعة أ');
    expect(history[0].toGroupName).toBe('مجموعة ب');
    expect(history[0].toGroupId).toBe(groupId2);
    expect(history[0].reason).toBe('تغيير المدرس');
  });

  it('التحويل بيدعم الالتحاق من حصة معينة في المجموعة الجديدة', async () => {
    const { groupId, groupId2, studentId } = await seedSecondGroup(800, 1);
    await enrollStudent(studentId, groupId, 800);

    await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId2, startSession: 3 });

    const balance = await getStudentBalance(studentId);
    expect(balance?.owed).toBe(600);        // 6 حصص × 100
    expect(balance?.remaining).toBe(-200);  // الرصيد المرحّل (800) أكبر من المستحق → فائض 200
  });

  it('بيرفض: نفس المجموعة / مش مسجل / مجموعة مكتملة', async () => {
    const { groupId, groupId2, studentId } = await seedSecondGroup(800, 1);
    await enrollStudent(studentId, groupId);

    expect((await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId })).success).toBe(false);
    expect((await transferStudent({ studentId, fromGroupId: groupId2, toGroupId: groupId })).error)
      .toContain('غير مسجل');

    const target = await dbGetById<Group>('groups', groupId2);
    await dbPut('groups', { ...target!, maxStudents: 0 });
    expect((await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId2 })).error)
      .toContain('مكتملة');
  });

  it('بيرفض التحويل مرتين لنفس المجموعة', async () => {
    const { groupId, groupId2, studentId } = await seedSecondGroup(800, 1);
    await enrollStudent(studentId, groupId);
    expect((await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId2 })).success).toBe(true);
    // دلوقتي هو في مجموعة ب، فالتحويل "من مجموعة أ" تاني لازم يفشل
    expect((await transferStudent({ studentId, fromGroupId: groupId, toGroupId: groupId2 })).success).toBe(false);
  });
});
