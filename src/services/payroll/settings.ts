import { getDB } from '../../data/database';
import type { Teacher } from '../../domain/models';
import { validateTeacherPaySettings } from '../../domain/payroll/settings';
import type { TeacherPaySettings } from '../../domain/payroll/types';

/** يحدّث الحقول المالية فقط، فلا يستبدل بيانات المدرس الأكاديمية بنسخة قديمة. */
export async function updateTeacherPaySettings(teacherId: string, settings: TeacherPaySettings): Promise<void> {
  const error = validateTeacherPaySettings(settings);
  if (error) throw new Error(error);
  const db = await getDB();
  const tx = db.transaction('teachers', 'readwrite');
  const teacher: Teacher | undefined = await tx.store.get(teacherId);
  if (!teacher || teacher.deleted) throw new Error('المدرس غير موجود');
  await tx.store.put({
    ...teacher,
    payModel: settings.payModel || 'fixed',
    payRate: settings.payRate,
    salary: settings.salary,
    payNotes: settings.payNotes?.trim(),
    updatedAt: new Date().toISOString(),
  } satisfies Teacher);
  await tx.done;
}
