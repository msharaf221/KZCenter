/**
 * كاتالوج المواد الدراسية وأسعارها الشهرية
 * ================================================
 *
 * المشكلة قبل كده: «المادة» مكانتش موجودة أصلاً في النظام — كان فيه كورسات
 * بأسماء حرة (s.r · level 3 · اقرا · grammer …) وكل كورس بسعره اليدوي، فالمدرس
 * والمجموعة بيتربطوا بكورس مش بمادة، والأسعار بتتحط بالغلط أو بصفر عند الاستيراد.
 *
 * الملف ده مصدر الحقيقة للمواد:
 *  - المادة ليها `id`، اسم عربي/إنجليزي، سعر شهري افتراضي، أيقونة ولون وتصنيف.
 *  - يدعم إضافة مواد جديدة وتعديل المواد الحالية عبر `customSubjects` في إعدادات النظام.
 *  - `aliases` = كل الأسماء اللي ممكن تتكتب بيها المادة في الشيتات وأسماء الكورسات،
 *    وبيها بنطابق أي كورس/مجموعة قديمة بمادتها الصح (`matchSubject`).
 */

let customSubjectsCache: Subject[] | null = null;

/** يحدّث كاش المواد المخصصة في الذاكرة */
export function setCustomSubjectsCache(subjects: Subject[] | null): void {
  customSubjectsCache = subjects;
}

export function getCustomSubjectsCache(): Subject[] | null {
  return customSubjectsCache;
}

export type SubjectId = 'english' | 'math' | 'hesab' | 'arabic' | 'quran' | (string & {});

export interface Subject {
  id: SubjectId;
  /** الاسم اللي بيتعرض في الواجهة */
  name: string;
  nameEn: string;
  /** سعر الاشتراك الشهري الافتراضي (جنيه) */
  monthlyPrice: number;
  category: string;
  icon: string;
  color: string;
  /**
   * أسماء بديلة للمطابقة (بتتوحّد قبل المقارنة: تشكيل/همزات/حروف صغيرة).
   * الترتيب مش مهم — المطابقة بتفضّل أطول alias.
   */
  aliases: string[];
  /** وصف مختصر للكورس المتولّد من المادة */
  description: string;
  /** هل المادة مخصصة ومضافة من قبل المستخدم */
  isCustom?: boolean;
  /** هل تم حذف/إخفاء المادة من القائمة */
  deleted?: boolean;
}

export const SUBJECTS: Subject[] = [
  {
    id: 'english',
    name: 'إنجليزي',
    nameEn: 'English',
    monthlyPrice: 250,
    category: 'لغات',
    icon: '🌍',
    color: '#3b82f6',
    description: 'مادة اللغة الإنجليزية — 250 جنيه شهرياً',
    aliases: [
      'english', 'englsh', 'eng', 'انجليزي', 'انجليزى', 'الانجليزي', 'انجلش',
      'لغة انجليزية', 'لغه انجليزيه', 'اللغة الإنجليزية', 'انجليزي لغات',
      'grammar', 'grammer', 'phonics', 'reading', 'story reading', 'story',
      's.r', 'sr', 'level', 'conversation', 'listening', 'writing',
    ],
  },
  {
    id: 'math',
    name: 'ماث (Math)',
    nameEn: 'Math',
    monthlyPrice: 250,
    category: 'رياضيات',
    icon: '🔢',
    color: '#8b5cf6',
    description: 'الرياضيات باللغة الإنجليزية (ماث) — 250 جنيه شهرياً',
    aliases: [
      'math', 'maths', 'mathematics', 'ماث', 'ماثس', 'الماث', 'ماث انجليزي',
      'math en', 'english math', 'algebra', 'geometry',
    ],
  },
  {
    id: 'hesab',
    name: 'حساب / رياضيات',
    nameEn: 'Arabic Math',
    monthlyPrice: 200,
    category: 'رياضيات',
    icon: '🧮',
    color: '#f97316',
    description: 'الحساب/الرياضيات باللغة العربية — 200 جنيه شهرياً',
    aliases: [
      'حساب', 'الحساب', 'حسابات', 'رياضيات', 'الرياضيات', 'رياضيات عربي',
      'حساب عربي', 'مناهج حساب', 'جبر', 'هندسه',
    ],
  },
  {
    id: 'arabic',
    name: 'عربي',
    nameEn: 'Arabic',
    monthlyPrice: 200,
    category: 'لغات',
    icon: '📖',
    color: '#22c55e',
    description: 'مادة اللغة العربية — 200 جنيه شهرياً',
    aliases: [
      'عربي', 'عربى', 'العربي', 'لغة عربية', 'لغه عربيه', 'اللغة العربية',
      'arabic', 'عربي لغات', 'نحو', 'املاء', 'خط عربي', 'قراءة', 'قرايه',
      'اقرا', 'اقرأ',
    ],
  },
  {
    id: 'quran',
    name: 'قرآن',
    nameEn: 'Quran',
    monthlyPrice: 200,
    category: 'قرآن وتحفيظ',
    icon: '🕌',
    color: '#14b8a6',
    description: 'تحفيظ القرآن الكريم والتجويد — 200 جنيه شهرياً',
    aliases: [
      'قران', 'قرأن', 'قرآن', 'القران', 'القرآن', 'تحفيظ', 'التحفيظ',
      'تحفيظ قران', 'تجويد', 'التجويد', 'quran', 'qoran', 'koran', 'quraan',
      'حفظ', 'نوراني', 'القاعدة النورانية', 'القاعده النورانيه',
    ],
  },
];

/** تصنيفات الكورسات الافتراضية */
export const SUBJECT_CATEGORIES = [...new Set(SUBJECTS.map(s => s.category))];

export const SUBJECT_IDS = SUBJECTS.map(s => s.id);

/**
 * جلب جميع المواد الفعالة (الأساسية + المخصصة من الإعدادات مع تطبيق التعديلات والحذف)
 */
export function getAllSubjects(customSubjects?: Subject[]): Subject[] {
  const custom = customSubjects || customSubjectsCache;
  if (!custom || custom.length === 0) {
    return SUBJECTS;
  }

  const subjectMap = new Map<string, Subject>();
  for (const s of SUBJECTS) {
    subjectMap.set(s.id, { ...s });
  }

  for (const item of custom) {
    if (item.deleted) {
      subjectMap.delete(item.id);
      continue;
    }
    const existing = subjectMap.get(item.id);
    if (existing) {
      subjectMap.set(item.id, { ...existing, ...item });
    } else {
      subjectMap.set(item.id, {
        ...item,
        aliases: item.aliases || [item.name, item.nameEn].filter(Boolean),
        category: item.category || 'عام',
        icon: item.icon || '📚',
        color: item.color || '#6366f1',
        description: item.description || '',
        monthlyPrice: item.monthlyPrice ?? 0,
      });
    }
  }

  return Array.from(subjectMap.values());
}

/**
 * جلب جميع تصنيفات المواد المتاحة
 */
export function getSubjectCategories(customSubjects?: Subject[]): string[] {
  return [...new Set(getAllSubjects(customSubjects).map(s => s.category).filter(Boolean))];
}

/**
 * جلب مادة حسب المعرّف
 */
export function getSubject(id?: string | null, customSubjects?: Subject[]): Subject | undefined {
  if (!id) return undefined;
  return getAllSubjects(customSubjects).find(s => s.id === id);
}

/**
 * جلب مادة بشكل آمن (مع كائن بديل افتراضي لتجنب أخطاء undefined في الواجهة)
 */
export function getSubjectSafe(id?: string | null, customSubjects?: Subject[]): Subject {
  const found = getSubject(id, customSubjects);
  if (found) return found;
  return {
    id: (id || 'general') as SubjectId,
    name: id || 'عام',
    nameEn: id || 'General',
    monthlyPrice: 0,
    category: 'عام',
    icon: '📚',
    color: '#6366f1',
    aliases: [],
    description: '',
  };
}

// ==================== NORMALIZATION ====================

/**
 * توحيد النص قبل المطابقة:
 * تشكيل/تطويل، همزات، ى/ي، ة/ه، حروف لاتينية صغيرة، وأي رموز → مسافة.
 */
export function normalizeSubjectText(input: unknown): string {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** هل الـ alias موجود ككلمة (أو تتابع كلمات) كاملة داخل النص؟ */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const words = haystack.split(' ');
  const parts = needle.split(' ');
  for (let i = 0; i + parts.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) {
      if (words[i + j] !== parts[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * تخمين المادة من أي نص (اسم كورس / اسم مجموعة / عنوان عمود في الشيت / تخصص مدرس).
 */
export function matchSubject(...texts: (string | undefined | null)[]): Subject | null {
  const normalized = texts.map(normalizeSubjectText).filter(Boolean);
  if (normalized.length === 0) return null;

  const all = getAllSubjects();
  const aliasIndex = all
    .flatMap(subject => [subject.name, subject.nameEn, ...subject.aliases]
      .map(a => ({ subject, alias: normalizeSubjectText(a) })))
    .filter(x => x.alias.length > 0)
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const text of normalized) {
    for (const { subject, alias } of aliasIndex) {
      if (containsWord(text, alias)) return subject;
    }
  }
  return null;
}

/** نفس `matchSubject` بس بترجّع الـ id (أسهل في التخزين) */
export function matchSubjectId(...texts: (string | undefined | null)[]): SubjectId | null {
  return matchSubject(...texts)?.id ?? null;
}

// ==================== PRICES ====================

/** خريطة أسعار المواد (id ← سعر شهري) */
export type SubjectPrices = Partial<Record<SubjectId, number>>;

export const DEFAULT_SUBJECT_PRICES: Record<string, number> = SUBJECTS.reduce(
  (acc, s) => { acc[s.id] = s.monthlyPrice; return acc; },
  {} as Record<string, number>,
);

/**
 * السعر الشهري المعتمد لمادة: من الإعدادات لو المستخدم عدّله، وإلا الافتراضي.
 */
export function subjectPrice(id: SubjectId, overrides?: SubjectPrices | null, customSubjects?: Subject[]): number {
  const custom = overrides?.[id];
  if (typeof custom === 'number' && Number.isFinite(custom) && custom > 0) {
    return Math.round(custom * 100) / 100;
  }
  const subj = getSubject(id, customSubjects);
  if (subj && typeof subj.monthlyPrice === 'number' && subj.monthlyPrice > 0) {
    return subj.monthlyPrice;
  }
  return DEFAULT_SUBJECT_PRICES[id] ?? 0;
}

/** كل المواد بأسعارها الفعلية (للعرض في الإعدادات وصفحة الكورسات) */
export function subjectsWithPrices(overrides?: SubjectPrices | null, customSubjects?: Subject[]): (Subject & { price: number })[] {
  return getAllSubjects(customSubjects).map(s => ({ ...s, price: subjectPrice(s.id, overrides, customSubjects) }));
}
