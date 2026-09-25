import { readAll } from '../../data/readers';
import { writeTransaction } from '../../data/transactions';
import { requireRule } from '../../domain/errors';
import type { Course, Group, InventoryItem, Teacher } from '../../domain/models';
import { validateTeacherPaySettings } from '../../domain/payroll/settings';
import { requireChoice, requireLive, requireMoney, requireNumber, requireText } from '../../domain/validation';
import { generateId } from '../../lib/ids';
import { can } from '../../lib/permissions';
import { validateEmail, validatePhone } from '../../lib/utils';
import { recalculateStudentTotalPaid } from '../balanceService';
import { withBillingTransaction } from '../billing/unitOfWork';
import { removeGroupInUnit } from '../membership/removal';
import { commandAudit, requirePermission, type Actor } from './access';

export type TeacherDraft = Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>;
export type CourseDraft = Omit<Course, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>;
export type GroupDraft = Pick<
  Group,
  'name' | 'courseId' | 'levelId' | 'teacherId' | 'maxStudents' | 'status' | 'schedule'
>;
export type InventoryDraft = Pick<InventoryItem, 'name' | 'type' | 'costPrice' | 'sellPrice' | 'stock' | 'courseId'>;

export async function saveTeacher(actor: Actor, draft: TeacherDraft, id?: string, updatePay = true): Promise<Teacher> {
  requirePermission(actor, 'teachers', id ? 'edit' : 'create');
  requireText(draft.name, 'الاسم مطلوب');
  requireRule(validatePhone(draft.phone), 'رقم الهاتف غير صحيح');
  requireRule(!draft.email || validateEmail(draft.email), 'البريد الإلكتروني غير صحيح');
  requireChoice(draft.status, ['active', 'vacation', 'suspended'], 'حالة المدرس غير صحيحة');
  const managePay = updatePay && can(actor.role, 'payroll', 'edit');
  if (managePay) {
    const error = validateTeacherPaySettings(draft);
    requireRule(!error, error || 'إعدادات المستحقات غير صحيحة');
  }
  const saved = await writeTransaction(['teachers'], async tx => {
    const current = id ? requireLive(await tx.objectStore('teachers').get(id), 'المدرس غير موجود') : undefined;
    const now = new Date().toISOString();
    const row: Teacher = {
      ...current,
      id: current?.id || generateId(),
      name: draft.name,
      specialization: draft.specialization,
      subjectIds: draft.subjectIds,
      phone: draft.phone,
      email: draft.email,
      avatar: draft.avatar,
      notes: draft.notes,
      status: draft.status,
      salary: current?.salary || 0,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    if (managePay)
      Object.assign(row, {
        salary: draft.salary,
        payModel: draft.payModel,
        payRate: draft.payRate,
        payNotes: draft.payNotes,
      });
    await tx.objectStore('teachers').put(row);
    return row;
  });
  commandAudit(actor, {
    action: id ? 'update' : 'create',
    entity: 'teacher',
    entityId: saved.id,
    details: `${id ? 'تعديل' : 'إضافة'} مدرس: ${saved.name}`,
  });
  return saved;
}

export async function saveCourse(
  actor: Actor,
  draft: CourseDraft,
  id?: string,
): Promise<{ course: Course; recalculated: number }> {
  requirePermission(actor, 'courses', id ? 'edit' : 'create');
  requireText(draft.name, 'اسم الكورس مطلوب');
  requireMoney(draft.price);
  requireNumber(draft.durationMonths, 'مدة الكورس غير صحيحة', 1, true);
  if (draft.sessionsPerMonth !== undefined) requireNumber(draft.sessionsPerMonth, 'عدد الحصص غير صحيح', 1, true);
  requireRule(Array.isArray(draft.levels), 'المستويات غير صحيحة');
  const result = await writeTransaction(['courses'], async tx => {
    const current = id ? requireLive(await tx.objectStore('courses').get(id), 'الكورس غير موجود') : undefined;
    const now = new Date().toISOString();
    const course: Course = {
      ...current,
      id: current?.id || generateId(),
      name: draft.name,
      category: draft.category,
      description: draft.description,
      subjectId: draft.subjectId,
      price: draft.price,
      durationMonths: draft.durationMonths,
      sessionsPerMonth: draft.sessionsPerMonth,
      icon: draft.icon,
      color: draft.color,
      levels: draft.levels,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await tx.objectStore('courses').put(course);
    return { course, priceChanged: !!current && current.price !== course.price };
  });
  let recalculated = 0;
  if (result.priceChanged) {
    const [groups, students] = await Promise.all([readAll('groups'), readAll('students')]);
    const ids = new Set(groups.filter(group => group.courseId === result.course.id).map(group => group.id));
    for (const student of students.filter(s => s.enrolledGroups?.some(id => ids.has(id)))) {
      await recalculateStudentTotalPaid(student.id);
      recalculated++;
    }
  }
  commandAudit(actor, {
    action: id ? 'update' : 'create',
    entity: 'course',
    entityId: result.course.id,
    details: `${id ? 'تعديل' : 'إضافة'} كورس: ${result.course.name}`,
  });
  return { course: result.course, recalculated };
}

export async function saveGroup(actor: Actor, draft: GroupDraft, id?: string): Promise<Group> {
  requirePermission(actor, 'groups', id ? 'edit' : 'create');
  requireText(draft.name, 'اسم المجموعة مطلوب');
  requireNumber(draft.maxStudents, 'سعة المجموعة غير صحيحة', 1, true);
  requireChoice(draft.status, ['open', 'full', 'ended'], 'حالة المجموعة غير صحيحة');
  requireRule(Array.isArray(draft.schedule), 'الجدول غير صحيح');
  const saved = await writeTransaction(['groups', 'courses', 'teachers'], async tx => {
    const course = requireLive(await tx.objectStore('courses').get(draft.courseId), 'اختر كورساً موجوداً');
    requireLive(await tx.objectStore('teachers').get(draft.teacherId), 'اختر مدرساً موجوداً');
    const current = id ? requireLive(await tx.objectStore('groups').get(id), 'المجموعة غير موجودة') : undefined;
    const now = new Date().toISOString();
    const row: Group = {
      ...current,
      id: current?.id || generateId(),
      name: draft.name,
      courseId: course.id,
      subjectId: course.subjectId,
      levelId: draft.levelId,
      teacherId: draft.teacherId,
      maxStudents: draft.maxStudents,
      status: draft.status,
      schedule: draft.schedule,
      studentIds: current?.studentIds || [],
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await tx.objectStore('groups').put(row);
    return row;
  });
  commandAudit(actor, {
    action: id ? 'update' : 'create',
    entity: 'group',
    entityId: saved.id,
    details: `${id ? 'تعديل' : 'إضافة'} مجموعة: ${saved.name}`,
  });
  return saved;
}

export async function saveInventoryItem(actor: Actor, draft: InventoryDraft, id?: string): Promise<InventoryItem> {
  requirePermission(actor, 'inventory', id ? 'edit' : 'create');
  requireText(draft.name, 'يرجى إدخال اسم الملزمة/الكتاب');
  requireMoney(draft.costPrice);
  requireMoney(draft.sellPrice);
  requireNumber(draft.stock, 'الكمية غير صحيحة', 0, true);
  requireChoice(draft.type, ['book', 'handout', 'other'], 'نوع المخزون غير صحيح');
  const saved = await writeTransaction(['inventory'], async tx => {
    const current = id ? requireLive(await tx.objectStore('inventory').get(id), 'العنصر غير موجود') : undefined;
    const now = new Date().toISOString();
    const row: InventoryItem = {
      ...current,
      id: current?.id || generateId(),
      name: draft.name,
      type: draft.type,
      costPrice: draft.costPrice,
      sellPrice: draft.sellPrice,
      stock: draft.stock,
      courseId: draft.courseId,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await tx.objectStore('inventory').put(row);
    return row;
  });
  commandAudit(actor, {
    action: id ? 'update' : 'create',
    entity: 'inventory',
    entityId: saved.id,
    details: `${id ? 'تعديل' : 'إضافة'} عنصر في المخزن: ${saved.name}`,
  });
  return saved;
}

/** Shared deletion boundary, with linkage checked inside the same transaction as the tombstone. */
export async function deleteCatalogRecord(
  actor: Actor,
  store: 'teachers' | 'courses' | 'groups' | 'inventory',
  id: string,
): Promise<void> {
  requirePermission(actor, store, 'delete');
  if (store === 'groups') {
    const deleted = await withBillingTransaction(unit => removeGroupInUnit(unit, id, actor.id));
    commandAudit(actor, { action: 'delete', entity: 'group', entityId: id, details: `حذف: ${deleted.name}` });
    return;
  }
  const deleted = await writeTransaction([store, 'groups'], async tx => {
    const target = requireLive(await tx.objectStore(store).get(id), 'السجل غير موجود');
    if (store === 'teachers' || store === 'courses') {
      const linked = (await tx.objectStore('groups').getAll()).filter(
        group => !group.deleted && (store === 'teachers' ? group.teacherId : group.courseId) === id,
      );
      requireRule(
        !linked.length,
        store === 'teachers'
          ? `لا يمكن حذف المدرس - مسؤول عن ${linked.length} مجموعة. انقل المجموعات لمدرس آخر أولاً`
          : `لا يمكن حذف الكورس - مرتبط بـ ${linked.length} مجموعة. احذف المجموعات أولاً`,
      );
    }
    const now = new Date().toISOString();
    const tombstone = { ...target, deleted: true, deletedAt: now, deletedBy: actor.id, updatedAt: now };
    await tx.objectStore(store).put(tombstone);
    return target;
  });
  const entity = { teachers: 'teacher', courses: 'course', groups: 'group', inventory: 'inventory' }[store];
  commandAudit(actor, { action: 'delete', entity, entityId: id, details: `حذف: ${deleted.name}` });
}
