import { foldArabic, normalize } from './normalization';
import type { TimeRange } from './types';

export const ARABIC_REPLACEMENTS: [RegExp, string][] = [
  [/[أإآٱ]/, 'ا'],
  [/ى/, 'ي'],
  [/ؤ/, 'و'],
  [/ئ/, 'ي'],
  [/ة/, 'ه'],
];

/**
 * نفس التوحيد بس مع خريطة من كل حرف في الناتج لمكانه في النص الأصلي،
 * عشان نقدر نقصّ من النص الأصلي (مش من الموحّد) ونحافظ على كتابته.
 */
export function foldWithMap(input: string): { folded: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (/[\u064B-\u0652\u0640]/.test(ch)) continue;
    let out = ch;
    for (const [re, rep] of ARABIC_REPLACEMENTS) {
      if (re.test(ch)) {
        out = rep;
        break;
      }
    }
    chars.push(out);
    map.push(i);
  }
  return { folded: chars.join(''), map };
}

// ==================== DAYS ====================

export const DAY_PATTERNS: { key: string; label: string; patterns: string[] }[] = [
  { key: 'saturday', label: 'السبت', patterns: ['السبت', 'السيت', 'السب'] },
  { key: 'sunday', label: 'الاحد', patterns: ['الاحد', 'الأحد'] },
  { key: 'monday', label: 'الاثنين', patterns: ['الاثنين', 'الإثنين', 'الاتنين'] },
  { key: 'tuesday', label: 'الثلاثاء', patterns: ['الثلاثاء', 'الثلاث', 'التلات'] },
  { key: 'wednesday', label: 'الاربعاء', patterns: ['الاربعاء', 'الأربعاء', 'الاربعا'] },
  { key: 'thursday', label: 'الخميس', patterns: ['الخميس'] },
  { key: 'friday', label: 'الجمعة', patterns: ['الجمعه', 'الجمعة'] },
];

export const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** استخراج الأيام من نص العنوان (بيدعم «السبت والثلاث» و«الاثنين والخميس») */
export function parseDays(text: string): { keys: string[]; labels: string[] } {
  const folded = foldArabic(normalize(text));
  const keys: string[] = [];

  for (const d of DAY_PATTERNS) {
    if (d.patterns.some(p => folded.includes(foldArabic(p))) && !keys.includes(d.key)) {
      keys.push(d.key);
    }
  }

  keys.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  return { keys, labels: keys.map(k => DAY_PATTERNS.find(d => d.key === k)!.label) };
}

// ==================== TIME ====================

/** ساعات المراكز كلها مسائية (4 لـ 8) */
export function to24(hour: number): number {
  return hour >= 12 ? hour : hour + 12;
}

export const pad = (n: number) => String(n).padStart(2, '0');

/**
 * الميعاد بيكتب بشرطة مائلة بس: «4/5» = من 4 لـ 5.
 * (لو استخدمنا «-» كمان هيقرا «s.r 2 -3» كأنه ميعاد، فممنوع.)
 */
export const TIME_RE = /(\d{1,2})\s*[/\\]\s*(\d{1,2})/;

/** استخراج الفترة من «من 4/5». بيرجع null لو مفيش ميعاد في العنوان. */
export function parseTimeRange(text: string): TimeRange | null {
  const m = normalize(text).match(TIME_RE);
  if (!m) return null;
  const from = parseInt(m[1], 10);
  const to = parseInt(m[2], 10);
  if (from < 1 || from > 12 || to < 1 || to > 12 || to <= from) return null;

  return {
    start: `${pad(to24(from))}:00`,
    end: `${pad(to24(to))}:00`,
    label: `${from}/${to}`,
  };
}

// ==================== GROUP NAME ====================

/**
 * اسم المجموعة = العنوان بعد شيل الأيام والفترة وكلمة «من».
 * - لو فضل فاضي (مثال: «الاحد من 5/6») → «اسم المدرس - اليوم الميعاد»
 * - لو الاسم من غير رقم (مثال: «s.r» أو «حساب») → نضيف الميعاد عشان ما يتكررش
 */
export function extractGroupName(opts: {
  rawHeader: string;
  teacherName: string;
  days: { keys: string[]; labels: string[] };
  time: TimeRange | null;
}): string {
  const original = normalize(opts.rawHeader);
  const { folded, map } = foldWithMap(original);
  const cut = new Array<boolean>(original.length).fill(false);

  const markRange = (foldedIndex: number, foldedLength: number) => {
    const start = map[foldedIndex];
    const end = map[foldedIndex + foldedLength - 1] + 1;
    for (let i = start; i < end; i++) cut[i] = true;
  };

  // 1) الأيام — لازم يكون قبلها بداية أو مسافة، بس مش لازم بعدها
  //    (عشان نقدر نقرا «الاحدمن 5/6» اللي مكتوبة من غير مسافة)
  const isLetter = (ch?: string) => !!ch && /[\u0621-\u064Aa-zA-Z]/.test(ch);
  for (const d of DAY_PATTERNS) {
    for (const p of d.patterns) {
      const fp = foldArabic(p);
      let idx = folded.indexOf(fp);
      while (idx !== -1) {
        // نتخطى «و» الربط: «والخميس» = «و» + «الخميس»
        let left = idx - 1;
        while (left >= 0 && folded[left] === 'و') left--;
        if (!isLetter(folded[left])) markRange(left + 1, idx + fp.length - (left + 1));
        idx = folded.indexOf(fp, idx + fp.length);
      }
    }
  }

  // 2) الميعاد (نفس الـ regex اللي استخدمه parseTimeRange)
  const tm = folded.match(TIME_RE);
  if (tm && tm.index !== undefined) markRange(tm.index, tm[0].length);

  // 3) الكلمات المتبقية من العنوان («من» و«و» الربط) بتتشال على مستوى الكلمة
  //    بعد ما الأيام والميعاد اتشالوا — عشان «مناهج» ما تتقصّش لـ «اهج»
  const kept = original
    .split('')
    .filter((_, i) => !cut[i])
    .join('');
  const DROP_WORDS = new Set(['من', 'و']);
  const name = normalize(kept)
    .split(' ')
    .filter(w => w && !DROP_WORDS.has(foldArabic(w)))
    .join(' ')
    .replace(/^[-–—/\s]+|[-–—/\s]+$/g, '')
    .replace(/\s+/g, ' ');

  const fallback = [opts.teacherName, [opts.days.labels.join(' و '), opts.time?.label].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' - ');

  if (!name) return fallback;
  if (!/\d/.test(name) && opts.time?.label) return `${name} ${opts.time.label}`;
  return name;
}

// ==================== PLACEHOLDERS ====================

/** أعمدة فاضية أو placeholders («عمود5»، «Column3»، «gr 8») */
export function isPlaceholderHeader(header: string): boolean {
  const h = normalize(header);
  if (!h) return true;
  if (/^عمود\s*\d+$/i.test(h)) return true;
  if (/^column\s*\d+$/i.test(h)) return true;
  if (/^gr\s*\d+$/i.test(h)) return true;
  return false;
}
