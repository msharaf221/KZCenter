/** Stable subject identifiers and serialized catalog contract shared by the domain and UI. */
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

export type SubjectPrices = Partial<Record<SubjectId, number>>;
