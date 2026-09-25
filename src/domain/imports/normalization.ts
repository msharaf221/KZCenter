import type { Gender } from '../models';

/**
 * استخراج رقم موبايل مصري من نص الخلية.
 * بيدعم: 01012345678 · 1012345678 · +201012345678 · 010-1234-5678 · 010 1234 5678
 */
export function extractPhone(text: string): { phone?: string; name: string } {
  const raw = String(text ?? '');
  // نوحّد الفواصل عشان الأرقام المتقطعة تتجمع
  const compact = raw.replace(/[\s\-().]/g, '');
  // رقم موبايل مصري: 1[0125] + 8 أرقام (10 من غير الصفر)
  // ممكن تسبقه بادئة دولة (0020 / +20 / 20) أو صفر محلي، وما بعدهوش رقم تاني
  const m = compact.match(/(?:0020|\+?20|0)?(1[0125][0-9]{8})(?![0-9])/);
  if (!m) return { name: raw.trim() };

  const phone = `0${m[1]}`;
  // نشيل الرقم كامل من الاسم — بالبادئة (دولة/صفر محلي) وأي فواصل بين الأرقام
  const sep = '[\\s\\-().]*';
  const joinDigits = (d: string) => d.split('').join(sep);
  const prefixPat = `(?:\\+?${joinDigits('0020')}|\\+?${joinDigits('20')}|0)?`;
  const name = raw
    .replace(new RegExp(`${prefixPat}${sep}${joinDigits(m[1])}(?![0-9])`, 'g'), ' ')
    .replace(/[\s\-().]+/g, ' ')
    .trim();
  return { phone, name: name || raw.trim() };
}

// ==================== NORMALIZATION ====================

export const normalize = (s: unknown): string =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** توحيد الألف عشان الأخطاء الإملائية والهمزات في الشيت */
export function foldArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0640]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه');
}

// ==================== GENDER GUESS ====================

/**
 * تخمين النوع من الاسم الأول — تقريبي، والمستخدم هيراجعه.
 * أي اسم مش في القائمة بيتحسب «ولد».
 */
export const FEMALE_FIRST_NAMES = new Set(
  `فاطمه مريم عائشه زينب ساره نورهان مني هدي امنيه رقيه جودي جود ليلي ليان لين لمار لينا لوتس
   مكه كارما كارلا كارن كارين كنده تاليا تالين تيا فريده سدره سلمي سمر سجي سجى شروق شيماء يارا
   جنه حور داليدا روفان روفيده ريم زينه ملك منار مناره ميار ندي نوال نور نوران هاجر وتين ايسل
   اسيل سيليا بسملة تمارا ايلن ايه اسماء افنان ايمان انجي تسنيم تقى حبيبه خديجه داليا دانه رنا
   رحاب زهراء سما سهيله صفا عهد غاده ماهيتاب منه مها مي نجوي نهى هبه هند ولاء ياسمين يمنى
   روان رزان ريتال ريتاج مليكه رودينا ساندي نرمين اروى جنى هنا شهد لي لي تالا لمى سلسبيل ميس
   جويريه خديجة فاطمة سارة هدى رقية مكة فريدة سدرة سلمى زينة منارة ندى نوال نوران آية أسماء
   أفنان إيمان إنجي حبيبة دانا سهيلة غادة منة نجوى هبة أروى جنى تالا`
    .split(/\s+/)
    .filter(Boolean)
    .map(foldArabic),
);

export function guessGender(fullName: string): Gender {
  const first = foldArabic(normalize(fullName).split(' ')[0] || '');
  return FEMALE_FIRST_NAMES.has(first) ? 'female' : 'male';
}

export const fold = (s: unknown): string => foldArabic(normalize(s).toLowerCase());

/** توحيد رقم الموبايل المصري (01xxxxxxxxx) */
export function normalizePhone(p?: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) return d;
  if (d.length === 12 && d.startsWith('20')) return `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith('1')) return `0${d}`;
  return d || '';
}
