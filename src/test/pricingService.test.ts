import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import * as database from '../data/database';
import { readAll, readById } from '../data/readers';
import { dbAdd, dbPut } from '../data/records';
import type { Course, Group, Student } from '../domain/models';
import { importAllData } from '../services/backupService';
import type { CommandActor } from '../services/commands/access';
import { saveCourse, saveGroup } from '../services/commands/catalog';
import { enrollStudent } from '../services/enrollmentService';
import { calculateEffectivePrice, getCatalogPrice, getEffectivePricingBreakdown, isGroupPriceCustom } from '../services/pricingService';
import { transferStudent } from '../services/transferService';

const NOW = '2026-09-01T10:00:00.000Z';

const ADMIN_USER: CommandActor = {
  id: 'admin-1',
  username: 'admin',
  role: 'admin',
};

const VIEW_ONLY_USER: CommandActor = {
  id: 'viewer-1',
  username: 'viewer',
  role: 'teacher',
};

async function clearDatabase() {
  const db = await database.getDB();
  for (const store of db.objectStoreNames) {
    await db.clear(store);
  }
}

describe('Pricing Service - calculateEffectivePrice', () => {
  const baseCourse: Course = {
    id: 'course-1',
    name: 'لغة إنجليزية',
    category: 'لغات',
    price: 300,
    durationMonths: 1,
    icon: '📘',
    color: '#6366f1',
    levels: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  const baseGroup: Group = {
    id: 'group-1',
    name: 'مجموعة النخبة',
    courseId: 'course-1',
    teacherId: 'teacher-1',
    schedule: [{ days: ['sunday'], startTime: '16:00', endTime: '18:00' }],
    maxStudents: 20,
    status: 'open',
    studentIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('يعتمد سعر الكورس عندما لا يوجد سعر خاص للمجموعة ولا للطالب', () => {
    const price = calculateEffectivePrice({
      course: baseCourse,
      group: baseGroup,
    });
    expect(price).toBe(300);
    expect(isGroupPriceCustom(baseGroup)).toBe(false);
    expect(getCatalogPrice({ course: baseCourse, group: baseGroup })).toBe(300);
  });

  it('يعتمد سعر المجموعة عندما يتم تحديده كقيمة مخصصة', () => {
    const groupWithCustomPrice: Group = { ...baseGroup, price: 400 };
    const price = calculateEffectivePrice({
      course: baseCourse,
      group: groupWithCustomPrice,
    });
    expect(price).toBe(400);
    expect(isGroupPriceCustom(groupWithCustomPrice)).toBe(true);
    expect(getCatalogPrice({ course: baseCourse, group: groupWithCustomPrice })).toBe(400);
  });

  it('يعتبر السعر 0 للمجموعة سعراً صالحاً (مجاني) ولا يعتبره قيمة مفقودة أو غير محددة', () => {
    const freeGroup: Group = { ...baseGroup, price: 0 };
    const price = calculateEffectivePrice({
      course: baseCourse, // سعره 300
      group: freeGroup,   // سعره 0
    });
    expect(price).toBe(0);
    expect(isGroupPriceCustom(freeGroup)).toBe(true);
    expect(getCatalogPrice({ course: baseCourse, group: freeGroup })).toBe(0);
  });

  it('يعتبر السعر 0 للكورس سعراً صالحاً (مجاني) ولا يعتبره غير محدد', () => {
    const freeCourse: Course = { ...baseCourse, price: 0 };
    const price = calculateEffectivePrice({
      course: freeCourse,
      group: baseGroup,
    });
    expect(price).toBe(0);
    expect(getCatalogPrice({ course: freeCourse, group: baseGroup })).toBe(0);
  });

  it('يعطي الأولوية للسعر الخاص بالطالب priceOverride فوق سعر المجموعة وسعر الكورس', () => {
    const groupWithPrice: Group = { ...baseGroup, price: 400 };
    const price = calculateEffectivePrice({
      course: baseCourse,       // 300
      group: groupWithPrice,    // 400
      priceOverride: 250,       // 250
    });
    expect(price).toBe(250);
  });

  it('يقبل السعر الخاص بالطالب إذا كان 0 (منحة مجانية للطالب)', () => {
    const groupWithPrice: Group = { ...baseGroup, price: 400 };
    const price = calculateEffectivePrice({
      course: baseCourse,
      group: groupWithPrice,
      priceOverride: 0,
    });
    expect(price).toBe(0);
  });

  it('يطبق الخصم بالنسبة المئوية ثم الخصم الثابت بالترتيب الصحيح', () => {
    // السعر الأساسي 400
    // خصم 10% = 40 => المتبقي 360
    // خصم ثابت 60 => المتبقي 300
    const price = calculateEffectivePrice({
      course: baseCourse,
      group: { ...baseGroup, price: 400 },
      discountPercent: 10,
      discountAmount: 60,
    });
    expect(price).toBe(300);

    const breakdown = getEffectivePricingBreakdown({
      course: baseCourse,
      group: { ...baseGroup, price: 400 },
      discountPercent: 10,
      discountAmount: 60,
    });
    expect(breakdown.catalogBase).toBe(400);
    expect(breakdown.isGroupCustom).toBe(true);
    expect(breakdown.effectiveBase).toBe(400);
    expect(breakdown.saved).toBe(100);
    expect(breakdown.final).toBe(300);
  });
});

describe('Catalog Commands & Audit Logging for Pricing', () => {
  beforeEach(async () => {
    await clearDatabase();
    await dbAdd('teachers', {
      id: 'teacher-1',
      name: 'أستاذ محمد',
      specialization: 'علوم',
      phone: '01000000000',
      salary: 0,
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('يحفظ الكورس ويسجل تدقيقاً مالياً عند تعديل السعر', async () => {
    const { course: created } = await saveCourse(ADMIN_USER, {
      name: 'فيزياء',
      category: 'علوم',
      icon: '📘',
      color: '#6366f1',
      durationMonths: 1,
      levels: [],
      price: 200,
    });
    expect(created.price).toBe(200);

    // تعديل السعر
    const { course: updated } = await saveCourse(ADMIN_USER, {
      name: 'فيزياء متقدمة',
      category: 'علوم',
      icon: '📘',
      color: '#6366f1',
      durationMonths: 1,
      levels: [],
      price: 280,
    }, created.id);
    expect(updated.price).toBe(280);

    // التحقق من سجل التدقيق
    const auditLogs = await readAll('audit_logs');
    const priceChangeAudit = auditLogs.find(
      a => a.entity === 'course' && a.action === 'update' && a.details?.includes('200') && a.details?.includes('280'),
    );
    expect(priceChangeAudit).toBeDefined();
    expect(priceChangeAudit?.userId).toBe(ADMIN_USER.id);
  });

  it('يحفظ المجموعة بسعر خاص أو موروث ويسجل تدقيقاً مالياً', async () => {
    const { course } = await saveCourse(ADMIN_USER, {
      name: 'كيمياء',
      category: 'علوم',
      icon: '📘',
      color: '#6366f1',
      durationMonths: 1,
      levels: [],
      price: 220,
    });

    // إنشاء مجموعة بدون سعر خاص
    const group1 = await saveGroup(ADMIN_USER, {
      name: 'مجموعة أ',
      courseId: course.id,
      teacherId: 'teacher-1',
      maxStudents: 20,
      status: 'open',
      schedule: [],
      price: null,
    });
    expect(group1.price).toBeUndefined();

    // تعديل المجموعة وتحديد سعر خاص 260
    const groupWithPrice = await saveGroup(ADMIN_USER, {
      name: 'مجموعة أ',
      courseId: course.id,
      teacherId: 'teacher-1',
      maxStudents: 20,
      status: 'open',
      schedule: [],
      price: 260,
    }, group1.id);
    expect(groupWithPrice.price).toBe(260);

    // التحقق من التدقيق المالي
    const auditLogs = await readAll('audit_logs');
    const groupAudit = auditLogs.find(
      a => a.entity === 'group' && a.details?.includes('260'),
    );
    expect(groupAudit).toBeDefined();

    // إعادة المجموعة للسعر الموروث بتفريغ الحقل (null)
    const resetGroup = await saveGroup(ADMIN_USER, {
      name: 'مجموعة أ',
      courseId: course.id,
      teacherId: 'teacher-1',
      maxStudents: 20,
      status: 'open',
      schedule: [],
      price: null,
    }, group1.id);
    expect(resetGroup.price).toBeUndefined();
  });

  it('يمنع المستخدم غير المخول من تعديل الأسعار', async () => {
    await expect(
      saveCourse(VIEW_ONLY_USER, { name: 'أحياء', category: 'علوم', icon: '📘', color: '#6366f1', durationMonths: 1, levels: [], price: 100 }),
    ).rejects.toThrow();

    await expect(
      saveGroup(VIEW_ONLY_USER, { name: 'مجموعة أحياء', courseId: 'c-1', teacherId: 't-1', maxStudents: 20, status: 'open', schedule: [], price: 150 }),
    ).rejects.toThrow();
  });
});

describe('Enrollment, Renewal, Transfer & Historical Immobility', () => {
  beforeEach(async () => {
    await clearDatabase();
    await dbPut('settings', { id: 'main', sessionsPerMonth: 8, currency: 'EGP' });
    await dbAdd('teachers', {
      id: 'teacher-1',
      name: 'أستاذ محمد',
      specialization: 'عام',
      phone: '01000000000',
      salary: 0,
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('تسجيل طالب جديد في مجموعة ذات سعر خاص يستخدم سعر المجموعة للأقساط', async () => {
    const student: Student = {
      id: 'student-1',
      name: 'أحمد علي',
      age: 15,
      gender: 'male',
      parentPhone: '01011112222',
      status: 'active',
      totalPaid: 0,
      enrolledGroups: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await dbAdd('students', student);

    const course: Course = {
      id: 'course-1',
      name: 'رياضيات',
      category: 'رياضيات',
      price: 200,
      durationMonths: 1,
      icon: '📐',
      color: '#6366f1',
      levels: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await dbAdd('courses', course);

    const group: Group = {
      id: 'group-1',
      name: 'رياضيات مكثفة',
      courseId: 'course-1',
      teacherId: 'teacher-1',
      price: 350, // سعر خاص أعلى من الكورس
      schedule: [{ days: ['monday'], startTime: '15:00', endTime: '17:00' }],
      maxStudents: 15,
      status: 'open',
      studentIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await dbAdd('groups', group);

    const result = await enrollStudent(student.id, group.id);

    expect(result.success).toBe(true);
    expect(result.enrollmentId).toBeDefined();
    const installments = await readAll('installments');
    expect(installments.length).toBeGreaterThan(0);
    // القسط الشهري يجب أن يكون 350
    expect(installments[0].amount).toBe(350);
  });

  it('تعديل سعر الكورس أو المجموعة لاحقاً لا يغيّر الأقساط القائمة ولا المدفوعة إطلاقاً', async () => {
    const student: Student = {
      id: 'student-2',
      name: 'محمود حسن',
      age: 16,
      gender: 'male',
      parentPhone: '01033334444',
      status: 'active',
      totalPaid: 0,
      enrolledGroups: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await dbAdd('students', student);

    const { course } = await saveCourse(ADMIN_USER, { name: 'عربي', category: 'لغات', icon: '📘', color: '#6366f1', durationMonths: 1, levels: [], price: 200 });
    const group = await saveGroup(ADMIN_USER, { name: 'مجموعة عربي', courseId: course.id, teacherId: 'teacher-1', maxStudents: 20, status: 'open', schedule: [], price: 250 });

    const enrollRes = await enrollStudent(student.id, group.id);
    expect(enrollRes.success).toBe(true);

    const initialInstallments = await readAll('installments');
    expect(initialInstallments[0].amount).toBe(250);

    // تغيير سعر المجموعة من 250 إلى 400، وسعر الكورس من 200 إلى 300
    await saveCourse(ADMIN_USER, { name: 'عربي', category: 'لغات', icon: '📘', color: '#6366f1', durationMonths: 1, levels: [], price: 300 }, course.id);
    await saveGroup(ADMIN_USER, { name: 'مجموعة عربي', courseId: course.id, teacherId: 'teacher-1', maxStudents: 20, status: 'open', schedule: [], price: 400 }, group.id);

    // الأقساط القديمة تظل كما هي 250 دون أدنى تغيير
    const afterInstallments = await readAll('installments');
    expect(afterInstallments[0].amount).toBe(250);
    expect(afterInstallments[0].updatedAt).toBe(initialInstallments[0].updatedAt);
  });

  it('التحويل إلى مجموعة أخرى بموجب transferStudent يعتمد سعر المجموعة الجديدة عبر calculateEffectivePrice', async () => {
    const student: Student = {
      id: 'student-3',
      name: 'سارة خالد',
      age: 14,
      gender: 'female',
      parentPhone: '01055556666',
      status: 'active',
      totalPaid: 0,
      enrolledGroups: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await dbAdd('students', student);

    const { course } = await saveCourse(ADMIN_USER, { name: 'علوم', category: 'علوم', icon: '🔬', color: '#6366f1', durationMonths: 1, levels: [], price: 180 });
    const groupA = await saveGroup(ADMIN_USER, { name: 'مجموعة أ', courseId: course.id, teacherId: 'teacher-1', maxStudents: 20, status: 'open', schedule: [], price: 180 });
    const groupB = await saveGroup(ADMIN_USER, { name: 'مجموعة ب المتميزة', courseId: course.id, teacherId: 'teacher-1', maxStudents: 20, status: 'open', schedule: [], price: 260 });

    await enrollStudent(student.id, groupA.id);

    // تحويل الطالب إلى المجموعة ب
    const transferResult = await transferStudent({
      studentId: student.id,
      fromGroupId: groupA.id,
      toGroupId: groupB.id,
      reason: 'تغيير الموعد إلى المجموعة المتميزة',
    });

    expect(transferResult.success).toBe(true);
    // التسجيل الجديد في المجموعة ب يرث سعر المجموعة ب (260)
    const effectiveTargetPrice = calculateEffectivePrice({
      course,
      group: groupB,
    });
    expect(effectiveTargetPrice).toBe(260);

    // الأقساط الجديدة بعد التحويل يجب أن تكون بسعر المجموعة الهدف (260)
    const allInstallments = await readAll('installments');
    const targetInstallment = allInstallments.find(i => i.groupId === groupB.id && !i.deleted);
    expect(targetInstallment?.amount).toBe(260);
  });
});

describe('Legacy Backups & SubjectPrices Decoupling', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('استعادة نسخة قديمة تحتوي subjectPrices لا تعيد تسعير الكورسات ولا تفعّل المزامنة التلقائية', async () => {
    const legacyBackup = {
      version: 1,
      timestamp: '2025-01-01T00:00:00.000Z',
      settings: {
        id: 'main',
        centerName: 'مركز تجريبي قديم',
        // النسخة القديمة بها أسعار مواد
        subjectPrices: {
          english: 500,
          math: 450,
          arabic: 400,
        },
      },
      courses: [
        {
          id: 'course-legacy-1',
          name: 'English General',
          subjectId: 'english',
          price: 250, // السعر المخزن في النسخة هو 250
          durationMonths: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      groups: [
        {
          id: 'group-legacy-1',
          name: 'Group 101',
          courseId: 'course-legacy-1',
          teacherId: 'teacher-1',
          // لا يوجد حقل price في المجموعة القديمة
          studentIds: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    };

    // الاستعادة
    await importAllData(legacyBackup);

    // التأكد من أن سعر الكورس ظل 250 ولم يتغير إلى 500 من subjectPrices
    const restoredCourse = await readById<Course>('courses', 'course-legacy-1');
    expect(restoredCourse?.price).toBe(250);

    // التأكد من أن المجموعة القديمة التي ليس لها price ترث سعر الكورس 250 عبر calculateEffectivePrice
    const restoredGroup = await readById<Group>('groups', 'group-legacy-1');
    expect(restoredGroup?.price).toBeUndefined();

    const effective = calculateEffectivePrice({
      course: restoredCourse!,
      group: restoredGroup!,
    });
    expect(effective).toBe(250);
  });

  it('فشل الاستعادة يتراجع ذرياً ولا يترك أي بيانات جزئية', async () => {
    const initialCourse: Course = {
      id: 'existing-course',
      name: 'كورس أصلي',
      category: 'عام',
      icon: '📘',
      color: '#6366f1',
      levels: [],
      price: 150,
      durationMonths: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await dbAdd('courses', initialCourse);

    const corruptBackup = {
      courses: [{ id: 'new-course', name: 'كورس جديد', price: 999 }],
      // إدخال معطوب غير قابل للحفظ يسبب فشل المعاملة
      teachers: [{ id: 'bad-teacher', invalidFunc: () => 'broken' }],
    };

    await expect(importAllData(corruptBackup)).rejects.toBeDefined();

    // التحقق من بقاء البيانات الأصلية سليمة دون تغيير
    const courses = await readAll<Course>('courses');
    expect(courses.length).toBe(1);
    expect(courses[0].id).toBe('existing-course');
    expect(courses[0].price).toBe(150);
  });
});
