/**
 * البحث الشامل (Global Search)
 *
 * البحث القديم في الهيدر كان بيودّيك لصفحة الطلاب بس. الاستقبال محتاج يلاقي
 * أي حاجة بسرعة: طالب، إيصال، دفعة، مجموعة، مدرس — من مكان واحد (Ctrl+K).
 */
import { dbGetAll } from './db';
import type { Course, Group, Payment, Student, Teacher, Refund } from './db';
import { formatCurrency, formatDate } from './utils';
import type { UserRole } from './db';
import { can } from './permissions';

export type SearchKind = 'student' | 'teacher' | 'group' | 'course' | 'payment' | 'refund';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  /** مسار للتنقل */
  to?: string;
  badge?: string;
  score: number;
}

const KIND_LABEL: Record<SearchKind, string> = {
  student: 'طالب',
  teacher: 'مدرس',
  group: 'مجموعة',
  course: 'كورس',
  payment: 'دفعة',
  refund: 'استرداد',
};

export function kindLabel(kind: SearchKind): string {
  return KIND_LABEL[kind];
}

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')          // تشكيل وتطويل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ترتيب النتائج: المطابقة من أول الكلمة أولاً، ثم الأقصر */
function score(haystack: string, needle: string): number {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  const idx = h.indexOf(n);
  if (idx === -1) return 0;
  return Math.max(10, 60 - idx);
}

export interface GlobalSearchOptions {
  query: string;
  limit?: number;
  /** دور المستخدم — بيتحكم في إيه اللي يظهر (مدرس ما يشوفش دفعات مثلاً) */
  role?: UserRole | null;
  /** تقييد على مجموعات محددة (للمدرس) */
  allowedGroupIds?: Set<string> | null;
  currency?: string;
}

/** بحث شامل في كل الكيانات */
export async function globalSearch(opts: GlobalSearchOptions): Promise<SearchResult[]> {
  const q = (opts.query || '').trim();
  if (q.length < 2) return [];

  const limit = opts.limit ?? 12;
  const role = opts.role ?? 'admin';
  const allowed = opts.allowedGroupIds ?? null;
  const currency = opts.currency || 'EGP';
  const out: SearchResult[] = [];

  const [students, teachers, groups, courses, payments, refunds] = await Promise.all([
    can(role, 'students', 'view') ? dbGetAll<Student>('students') : Promise.resolve([] as Student[]),
    can(role, 'teachers', 'view') ? dbGetAll<Teacher>('teachers') : Promise.resolve([] as Teacher[]),
    can(role, 'groups', 'view') ? dbGetAll<Group>('groups') : Promise.resolve([] as Group[]),
    can(role, 'courses', 'view') ? dbGetAll<Course>('courses') : Promise.resolve([] as Course[]),
    can(role, 'payments', 'view') ? dbGetAll<Payment>('payments') : Promise.resolve([] as Payment[]),
    can(role, 'refunds', 'view') ? dbGetAll<Refund>('refunds') : Promise.resolve([] as Refund[]),
  ]);

  const groupName = (id?: string) => groups.find(g => g.id === id)?.name || '';
  const studentName = (id?: string) => students.find(s => s.id === id)?.name || '';
  const inScope = (groupId?: string) => !allowed || (!!groupId && allowed.has(groupId));

  // الطلاب: اسم / تليفون / تليفون ولي الأمر
  for (const s of students) {
    if (allowed) {
      const visible = (s.enrolledGroups || []).some(g => allowed.has(g));
      if (!visible) continue;
    }
    const sc = Math.max(
      score(s.name, q),
      score(s.parentPhone || '', q) ? 70 : 0,
      score(s.phone || '', q) ? 70 : 0,
    );
    if (sc > 0) {
      out.push({
        kind: 'student', id: s.id, score: sc,
        title: s.name,
        subtitle: [s.parentPhone, (s.enrolledGroups || []).map(groupName).filter(Boolean).join(' · ')].filter(Boolean).join(' — '),
        to: `/students/${s.id}`,
        badge: s.status === 'active' ? 'نشط' : s.status === 'suspended' ? 'متوقف' : 'منتهي',
      });
    }
  }

  // المدرسون
  for (const t of teachers) {
    const sc = Math.max(score(t.name, q), score(t.specialization || '', q) * 0.8);
    if (sc > 0) {
      out.push({
        kind: 'teacher', id: t.id, score: sc, title: t.name,
        subtitle: t.specialization || t.phone, to: `/teachers/${t.id}`,
      });
    }
  }

  // المجموعات
  for (const g of groups) {
    if (!inScope(g.id)) continue;
    const sc = score(g.name, q);
    if (sc > 0) {
      out.push({
        kind: 'group', id: g.id, score: sc, title: g.name,
        subtitle: `${(g.studentIds || []).length}/${g.maxStudents} طالب`,
        to: '/groups', badge: g.status === 'open' ? 'مفتوحة' : g.status === 'full' ? 'مكتملة' : 'منتهية',
      });
    }
  }

  // الكورسات
  for (const c of courses) {
    const sc = score(c.name, q);
    if (sc > 0) {
      out.push({
        kind: 'course', id: c.id, score: sc, title: c.name,
        subtitle: `${formatCurrency(c.price, currency)} / شهر`, to: '/courses',
      });
    }
  }

  // الدفعات: رقم الإيصال (بحث مباشر) / اسم الطالب / المبلغ
  const digits = q.replace(/\D/g, '');
  for (const p of payments) {
    if (!inScope(p.groupId)) continue;
    const byReceipt = norm(p.receiptNo || '') === norm(q) || (p.receiptNo || '').toLowerCase().includes(q.toLowerCase());
    const sc = Math.max(
      byReceipt ? 95 : 0,
      score(studentName(p.studentId), q),
      digits && String(p.amount) === digits ? 60 : 0,
    );
    if (sc > 0) {
      out.push({
        kind: 'payment', id: p.id, score: sc,
        title: `${formatCurrency(p.amount, currency)} — ${studentName(p.studentId)}`,
        subtitle: [p.receiptNo ? `إيصال ${p.receiptNo}` : '', formatDate(p.date), groupName(p.groupId)].filter(Boolean).join(' · '),
        to: '/payments',
        badge: p.voided ? 'ملغاة' : p.status === 'paid' ? 'مدفوعة' : p.status === 'late' ? 'متأخرة' : 'معلقة',
      });
    }
  }

  // الاستردادات
  for (const r of refunds) {
    const sc = Math.max(score(studentName(r.studentId), q), score(r.reason || '', q) * 0.7);
    if (sc > 0) {
      out.push({
        kind: 'refund', id: r.id, score: sc,
        title: `استرداد ${formatCurrency(r.amount, currency)} — ${studentName(r.studentId)}`,
        subtitle: `${r.reason} · ${formatDate(r.date)}`, to: '/payments',
      });
    }
  }

  return out
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ar'))
    .slice(0, limit);
}
