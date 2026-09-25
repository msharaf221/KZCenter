import type { Student } from './models';

/**
 * كشف التكرار: نفس التليفون = شبه مؤكد نفس الشخص،
 * والاسم المتطابق بعد التوحيد = احتمال عالي. بننبّه المستخدم قبل ما يعمل نسخة مكررة.
 */
const foldName = (s: string) =>
  s
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

const digits = (s?: string) => String(s || '').replace(/\D/g, '');

export interface DuplicateStudentWarning {
  kind: 'phone' | 'name';
  matches: Student[];
}

export function findStudentDuplicates(
  form: Pick<Student, 'name' | 'parentPhone'>,
  allStudents: readonly Student[],
  editingId?: string,
): DuplicateStudentWarning | null {
  const phone = digits(form.parentPhone);
  const nameKey = foldName(form.name);

  const matches = allStudents.filter(st => {
    if (editingId && st.id === editingId) return false;
    if (phone.length >= 10 && (digits(st.parentPhone) === phone || digits(st.phone) === phone)) return true;
    if (nameKey.length >= 6 && foldName(st.name) === nameKey) return true;
    return false;
  });

  if (matches.length === 0) return null;
  const byPhone = matches.some(
    st => phone.length >= 10 && (digits(st.parentPhone) === phone || digits(st.phone) === phone),
  );
  return { kind: byPhone ? 'phone' : 'name', matches: matches.slice(0, 3) };
}
