import { writeTransaction } from '../../data/transactions';
import type { Teacher } from '../../domain/models';
import { validateTeacherPaySettings } from '../../domain/payroll/settings';
import type { TeacherPaySettings } from '../../domain/payroll/types';

/** يحدّث الحقول المالية فقط، فلا يستبدل بيانات المدرس الأكاديمية بنسخة قديمة. */
export async function updateTeacherPaySettings(teacherId: string, settings: TeacherPaySettings): Promise<void> {
  const error = validateTeacherPaySettings(settings);
  if (error) throw new Error(error);
  await writeTransaction(['teachers'], async tx => {
    const teacher: Teacher | undefined = await tx.objectStore('teachers').get(teacherId);
    if (!teacher || teacher.deleted) throw new Error('المدرس غير موجود');
    await tx.objectStore('teachers').put({
      ...teacher,
      payModel: settings.payModel || 'fixed',
      payRate: settings.payRate,
      salary: settings.salary,
      payNotes: settings.payNotes?.trim(),
      updatedAt: new Date().toISOString(),
    } satisfies Teacher);
  });
}
