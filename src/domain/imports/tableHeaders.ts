import { normalizeSubjectText } from '../../lib/subjects';
import type { FieldKey } from './types';

/**
 * أسماء الأعمدة المقبولة لكل حقل.
 * المطابقة بتتم على النص الموحّد (من غير همزات/تشكيل/رموز)، وبتفضّل
 * المطابقة الكاملة على الجزئية عشان «اسم المدرس» ما تتقراش «اسم الطالب».
 */
export const FIELD_ALIASES: Record<FieldKey, string[]> = {
  studentName: [
    'اسم الطالب',
    'الطالب',
    'اسم الطالبة',
    'الطالبة',
    'اسم التلميذ',
    'التلميذ',
    'الاسم',
    'اسم',
    'student',
    'student name',
    'name',
    'pupil',
  ],
  studentPhone: [
    'تليفون الطالب',
    'موبايل الطالب',
    'رقم الطالب',
    'تليفون',
    'موبايل',
    'الهاتف',
    'رقم التليفون',
    'التليفون',
    'phone',
    'mobile',
    'student phone',
    'contact',
  ],
  parentPhone: [
    'تليفون ولي الامر',
    'رقم ولي الامر',
    'موبايل ولي الامر',
    'ولي الامر',
    'تليفون الاب',
    'تليفون الام',
    'parent phone',
    'guardian phone',
    'parent',
  ],
  age: ['السن', 'العمر', 'سن', 'age'],
  gender: ['النوع', 'الجنس', 'gender', 'sex'],
  teacherName: [
    'اسم المدرس',
    'المدرس',
    'مدرس',
    'المدرسة',
    'اسم المعلم',
    'المعلم',
    'معلم',
    'teacher',
    'teacher name',
    'instructor',
    'tutor',
  ],
  teacherPhone: ['تليفون المدرس', 'رقم المدرس', 'موبايل المدرس', 'teacher phone'],
  groupName: [
    'اسم المجموعة',
    'المجموعة',
    'مجموعة',
    'المجموعه',
    'الجروب',
    'جروب',
    'group',
    'group name',
    'class',
    'section',
  ],
  courseName: ['اسم الكورس', 'الكورس', 'كورس', 'course', 'course name', 'program'],
  subject: ['المادة', 'مادة', 'الماده', 'ماده', 'التخصص', 'المنهج', 'subject', 'material', 'specialization'],
  price: [
    'السعر',
    'سعر',
    'الاشتراك',
    'اشتراك',
    'المبلغ',
    'مبلغ',
    'الرسوم',
    'رسوم',
    'سعر الشهر',
    'السعر الشهري',
    'price',
    'fee',
    'fees',
    'amount',
    'monthly',
  ],
  day: ['اليوم', 'الايام', 'يوم', 'ايام', 'day', 'days', 'schedule'],
  time: ['الميعاد', 'الوقت', 'الساعة', 'ميعاد', 'time', 'hour', 'from to'],
  room: ['القاعة', 'قاعة', 'الغرفة', 'room', 'hall', 'class room'],
  maxStudents: ['السعة', 'الحد الاقصى', 'اقصى عدد', 'capacity', 'max', 'max students'],
  notes: ['ملاحظات', 'ملحوظات', 'note', 'notes', 'comment', 'remarks'],
};

/** فهرس المطابقة: النص الموحّد ← الحقل (مرتّب بالأطول عشان الأدق يكسب) */
export const ALIAS_TO_FIELD: { alias: string; field: FieldKey }[] = Object.entries(FIELD_ALIASES)
  .flatMap(([field, aliases]) =>
    aliases.map(alias => ({ alias: normalizeSubjectText(alias), field: field as FieldKey })),
  )
  .filter(x => x.alias.length > 0)
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * تحديد الحقل اللي يقابل عنوان عمود.
 * المطابقة الكاملة الأول، وبعدين «العنوان بيبدأ بالـ alias» (مثال: «تليفون الطالب 1»)،
 * وأخيراً الاحتواء الكامل ككلمات.
 */
export function detectField(header: string): FieldKey | null {
  const h = normalizeSubjectText(header);
  if (!h) return null;

  for (const { alias, field } of ALIAS_TO_FIELD) {
    if (h === alias) return field;
  }
  for (const { alias, field } of ALIAS_TO_FIELD) {
    if (h.startsWith(`${alias} `) || h.endsWith(` ${alias}`)) return field;
  }
  for (const { alias, field } of ALIAS_TO_FIELD) {
    const words = h.split(' ');
    const parts = alias.split(' ');
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, j) => words[i + j] === p)) return field;
    }
  }
  return null;
}

/**
 * خريطة أعمدة صف العناوين → الحقول.
 * أول عمود بيتطابق مع حقل هو اللي بيكسب (الأعمدة المكررة بتتجاهل).
 */
export function mapHeaders(headers: string[]): Partial<Record<FieldKey, number>> {
  const map: Partial<Record<FieldKey, number>> = {};
  headers.forEach((h, index) => {
    const field = detectField(h);
    if (field && map[field] === undefined) map[field] = index;
  });
  return map;
}

/**
 * هل الجدول ده «صف لكل سجل»؟
 * الشرط: فيه عمود اسم طالب + على الأقل عمود ربط واحد (مدرس/مجموعة/مادة/كورس).
 */
export function looksLikeTable(headers: string[]): boolean {
  const map = mapHeaders(headers);
  if (map.studentName === undefined) return false;
  return ['teacherName', 'groupName', 'subject', 'courseName'].some(k => map[k as FieldKey] !== undefined);
}
