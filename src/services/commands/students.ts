import { pickDraft } from '../../domain/drafts';
import { RuleError, requireRule } from '../../domain/errors';
import { membershipSelection } from '../../domain/membership/selection';
import type { Student } from '../../domain/models';
import { requireChoice, requireLive, requireMoney, requireNumber, requireText } from '../../domain/validation';
import { generateId } from '../../lib/ids';
import { parseCSV, validatePhone } from '../../lib/utils';
import { withBillingTransaction } from '../billing/unitOfWork';
import { detachInUnit, enrollInUnit } from '../membership/enrollment';
import { removeStudentInUnit } from '../membership/removal';
import { commandAudit, requirePermission, type Actor } from './access';

const profileFields = [
  'name',
  'age',
  'gender',
  'phone',
  'parentPhone',
  'avatar',
  'notes',
  'status',
  'school',
  'gradeLevel',
  'source',
  'parentName',
] as const;
export type StudentDraft = Pick<Student, (typeof profileFields)[number] | 'enrolledGroups'>;
export interface EnrollmentPricing {
  priceOverride?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
}
export interface StudentSubmission {
  draft: StudentDraft;
  id?: string;
  initialPayments?: Record<string, number>;
  startSessions?: Record<string, number>;
  pricing?: Record<string, EnrollmentPricing>;
  /** Memberships shown when opening an existing profile, if known by the UI. */
  baselineGroupIds?: string[];
}

/** Profile, membership changes and initial collections share one transaction. */
export async function saveStudent(actor: Actor, input: StudentSubmission) {
  requirePermission(actor, 'students', input.id ? 'edit' : 'create');
  const { draft } = input;
  requireText(draft.name, 'الاسم مطلوب');
  requireRule(validatePhone(draft.parentPhone), 'هاتف ولي الأمر غير صحيح');
  requireRule(!draft.phone || validatePhone(draft.phone), 'هاتف الطالب غير صحيح');
  requireNumber(draft.age, 'العمر يجب أن يكون بين 3 و 18 سنة', 3, true);
  requireRule(draft.age <= 18, 'العمر يجب أن يكون بين 3 و 18 سنة');
  requireChoice(draft.gender, ['male', 'female'], 'النوع غير صحيح');
  requireChoice(draft.status, ['active', 'suspended', 'ended'], 'حالة الطالب غير صحيحة');
  requireRule(Array.isArray(draft.enrolledGroups), 'المجموعات غير صحيحة');
  for (const amount of Object.values(input.initialPayments || {})) {
    requireMoney(amount);
    if (amount > 0) requirePermission(actor, 'payments', 'create');
  }
  for (const session of Object.values(input.startSessions || {})) requireNumber(session, 'رقم الحصة غير صحيح', 1, true);
  for (const pricing of Object.values(input.pricing || {})) {
    if (pricing.priceOverride !== undefined) requireMoney(pricing.priceOverride);
    if (pricing.discountAmount !== undefined) requireMoney(pricing.discountAmount);
    if (pricing.discountPercent !== undefined) {
      requireNumber(pricing.discountPercent, 'نسبة الخصم غير صحيحة');
      requireRule(pricing.discountPercent <= 100, 'نسبة الخصم غير صحيحة');
    }
  }
  const saved = await withBillingTransaction(async unit => {
    const current = input.id ? requireLive(await unit.get('students', input.id), 'الطالب غير موجود') : undefined;
    const old = current?.enrolledGroups || [];
    const wanted = membershipSelection(old, draft.enrolledGroups, input.baselineGroupIds);
    const added = wanted.filter(id => !old.includes(id));
    const removed = old.filter(id => !wanted.includes(id));
    const now = new Date().toISOString();
    const student: Student = {
      totalPaid: 0, enrolledGroups: [], ...current, ...pickDraft(draft, profileFields),
      id: current?.id || generateId(), createdAt: current?.createdAt || now, updatedAt: now,
    };
    if (current) await unit.put('students', student);
    else await unit.add('students', student);
    for (const groupId of removed) await detachInUnit(unit, student.id, groupId, 'تعديل بيانات الطالب', { allowLegacy: true, recalculate: false });
    for (const groupId of added) {
      const pricing = input.pricing?.[groupId] || {};
      await enrollInUnit(unit, student.id, groupId, input.initialPayments?.[groupId] || undefined, {
        startSession: input.startSessions?.[groupId] || 1,
        priceOverride: pricing.priceOverride && pricing.priceOverride > 0 ? pricing.priceOverride : undefined,
        discountAmount: pricing.discountAmount && pricing.discountAmount > 0 ? pricing.discountAmount : undefined,
        discountPercent: pricing.discountPercent && pricing.discountPercent > 0 ? pricing.discountPercent : undefined,
        discountReason: pricing.discountReason || undefined,
        paymentMethod: 'cash', collectedBy: actor.id, collectedByName: actor.username,
      });
    }
    if (added.length || removed.length) await unit.recalculate(student.id);
    return requireLive(await unit.get('students', student.id), 'الطالب غير موجود');
  });
  const warnings: string[] = []; // Compatibility: a failure now rejects and rolls back, rather than returning partial success.
  commandAudit(actor, {
    action: input.id ? 'update' : 'create',
    entity: 'student',
    entityId: saved.id,
    details: `${input.id ? 'تعديل' : 'إضافة'} طالب: ${saved.name}${warnings.length ? ` (${warnings.length} ملاحظة)` : ''}`,
  });
  return { student: saved, warnings };
}

export async function deleteStudents(actor: Actor, ids: string[]): Promise<{ deleted: number; warnings: string[] }> {
  requirePermission(actor, 'students', 'delete');
  requireRule(Array.isArray(ids) && ids.every(id => typeof id === 'string' && !!id.trim()), 'قائمة الطلاب غير صحيحة');
  const deleted = await withBillingTransaction(async unit => {
    const removed: Student[] = [];
    for (const id of new Set(ids)) {
      const student = await removeStudentInUnit(unit, id, actor.id);
      if (student) removed.push(student);
    }
    return removed;
  });
  for (const student of deleted) commandAudit(actor, {
    action: 'delete', entity: 'student', entityId: student.id,
    details: `حذف طالب: ${student.name} (المتبقي قبل الحذف: ${(student.totalOwed || 0) - student.totalPaid})`,
  });
  return { deleted: deleted.length, warnings: [] };

}

/** Legacy CSV layout stays supported; it now shares the same validation and permission boundary. */
export async function importStudentCSV(actor: Actor, text: string): Promise<{ imported: number; errors: number }> {
  requirePermission(actor, 'students', 'create');
  const rows = parseCSV(text);
  requireRule(rows.length >= 2, 'الملف فارغ أو غير صالح');
  const headers = rows[0];
  const nameIndex = headers.indexOf(headers.find(header => header.includes('الاسم')) || '');
  let imported = 0,
    errors = 0;
  for (const row of rows.slice(1)) {
    if (row.every(cell => !cell.trim())) continue;
    try {
      const draft: StudentDraft = {
        name: (row[nameIndex] || row[0] || '').trim(),
        age: parseInt(row[1]) || 12,
        gender: (row[2] || 'male') as Student['gender'],
        phone: row[3] || '',
        parentPhone: (row[4] || '').trim(),
        status: (row[5] || 'active') as Student['status'],
        notes: row[6] || '',
        enrolledGroups: [],
      };
      await saveStudent(actor, { draft });
      imported++;
    } catch (error) {
      if (!(error instanceof RuleError)) console.error('Student CSV row failed:', error);
      errors++;
    }
  }
  return { imported, errors };
}
