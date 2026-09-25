import type { Subject, SubjectId, SubjectPrices } from '../../lib/subjects';

/**
 * طريقة تحويل المجموعات لكورسات:
 *  - bySubject → كورس لكل **مادة** (إنجليزي/ماث/حساب/عربي/قرآن) — الأنضف، وبياخد سعر المادة
 *  - byType    → كورس لكل نوع مجموعة حسب اسمها الخام (s.r / level / اقرا …)
 *  - byTeacher → كورس لكل مدرس
 *  - single    → كورس واحد للكل
 */
export type CourseStrategy = 'single' | 'byType' | 'byTeacher' | 'bySubject';

export interface ParsedGroup {
  /** اسم المدرس (اسم التبويب) */
  teacherName: string;
  /** العنوان الخام من الشيت */
  rawHeader: string;
  /** اسم المجموعة بعد تنظيف اليوم والميعاد */
  name: string;
  /** مفاتيح الأيام بصيغة التطبيق */
  days: string[];
  /** أسماء الأيام بالعربي للعرض */
  dayLabels: string[];
  startTime: string;
  endTime: string;
  /** نص الميعاد الخام (مثال: "4/5") للعرض */
  timeLabel: string;
  students: string[];
}

/**
 * بيانات طالب مستخرجة من خلية الشيت.
 *
 * الشيتات الحقيقية بتكتب الاسم والتليفون في نفس الخلية أحياناً
 * («أحمد محمد 01012345678»)، والمطابقة بالاسم لوحده بتعمل كوارث:
 * طالبين بنفس الاسم بيتدمجوا في واحد، أو طالب موجود بيتعمله نسخة مكررة.
 * فبنستخرج التليفون ونطابق بيه الأول.
 */
export interface StudentMeta {
  /** الاسم بعد إزالة التليفون منه */
  name: string;
  /** التليفون بصيغة 11 رقم (01xxxxxxxxx) لو موجود في الخلية */
  phone?: string;
  /** النص الخام من الشيت */
  raw: string;
}

export interface SheetParseResult {
  /** أسماء المدرسين (الشيتات اللي فيها طلاب فعلاً) */
  teachers: string[];
  groups: ParsedGroup[];
  /** الأسماء الفريدة بعد إزالة التكرار */
  uniqueStudents: string[];
  /** نفس الطلاب لكن مع التليفون المستخرج من الخلية (للمطابقة الأدق) */
  studentMeta: StudentMeta[];
  /** أسماء اتكررت في الشيت بأرقام مختلفة (محتمل يكونوا أشخاص مختلفين) */
  duplicateNames: string[];
  /** عدد الخانات (اسم × مجموعة) قبل إزالة التكرار */
  totalSlots: number;
  /** طلاب مسجلين في أكتر من مجموعة */
  multiGroupStudents: number;
  /** عدد الأعمدة اللي اتخطّت (فاضية أو placeholders) */
  skippedColumns: number;
  /**
   * هل الشيت شكله شيت المركز فعلاً؟ (على الأقل مجموعة واحدة فيها يوم أو ميعاد)
   * عشان نمنع استيراد ملف إكسيل عشوائي بالغلط.
   */
  looksLikeCenterSheet: boolean;
  warnings: string[];
}

export interface TimeRange {
  start: string;
  end: string;
  label: string;
}

// ==================== IMPORT INTO DB ====================

export interface SheetImportOptions {
  courseStrategy: CourseStrategy;
  /** سعر الاشتراك الشهري الافتراضي للكورسات اللي مش متعرف مادتها */
  coursePrice: number;
  /** مدة الكورس بالشهور */
  durationMonths: number;
  /** بداية أرقام التليفونات الـ placeholder (بيتضاف عليها 4 أرقام تسلسلية) */
  phonePrefix: string;
  /** أكبر عدد طلاب في المجموعة */
  maxStudents: number;
  /**
   * استخدام أسعار المواد للكورسات اللي اتعرفت مادتها من اسم المجموعة
   * (english 250 · math 250 · حساب 200 · عربي 200 · قرآن 200).
   * لو متقفلة، كل الكورسات بتاخد `coursePrice`.
   */
  useSubjectPrices?: boolean;
  /** أسعار مخصّصة للمواد (من الإعدادات) — الافتراضي من كاتالوج المواد */
  subjectPrices?: SubjectPrices | null;
}

export interface SheetImportReport {
  teachersCreated: number;
  teachersExisting: number;
  coursesCreated: number;
  groupsCreated: number;
  groupsExisting: number;
  studentsCreated: number;
  studentsExisting: number;
  /** طلاب اتطابقوا بالتليفون (مش بالاسم) */
  studentsMatchedByPhone: number;
  /** عدد المجموعات اللي اتعرفت مادتها */
  groupsWithSubject: number;
  /** مجموعات مش واضح مادتها (محتاجة ربط يدوي من صفحة الكورسات) */
  groupsWithoutSubject: string[];
  /** المواد اللي اتعملها كورسات + سعر كل واحدة */
  subjectsUsed: { id: SubjectId; name: string; price: number; groups: number }[];
  /** أسماء في الشيت مطابقة لأكتر من طالب موجود → محتاجة مراجعة يدوية */
  ambiguousStudents: string[];
  enrollmentsCreated: number;
  enrollmentsSkipped: number;
  errors: string[];
}

// ==================== COLUMN DETECTION ====================

/** الحقول اللي بنعرف نقراها من الجدول */
export type FieldKey =
  | 'studentName'
  | 'studentPhone'
  | 'parentPhone'
  | 'age'
  | 'gender'
  | 'teacherName'
  | 'teacherPhone'
  | 'groupName'
  | 'courseName'
  | 'subject'
  | 'price'
  | 'day'
  | 'time'
  | 'room'
  | 'maxStudents'
  | 'notes';

// ==================== ROW PARSING ====================

/** سجل واحد بعد القراءة والتنظيف */
export interface TableRecord {
  studentName: string;
  studentPhone?: string;
  parentPhone?: string;
  age?: number;
  gender?: 'male' | 'female';
  teacherName?: string;
  teacherPhone?: string;
  groupName?: string;
  courseName?: string;
  /** المادة اللي اتعرفت (من عمود المادة أو من أسماء المجموعة/الكورس) */
  subject: Subject | null;
  /** السعر المكتوب صراحةً في الصف (بيتقدّم على سعر المادة) */
  price?: number;
  days: string[];
  dayLabels: string[];
  startTime?: string;
  endTime?: string;
  timeLabel?: string;
  room?: string;
  maxStudents?: number;
  notes?: string;
  /** رقم الصف في الملف (للتقارير والأخطاء) */
  rowNumber: number;
}

// ==================== PARSE RESULT ====================

export interface TableParseResult {
  records: TableRecord[];
  /** الحقول اللي اتعرفت في الملف */
  detectedFields: FieldKey[];
  /** عناوين أعمدة مش معروفة (بتتجاهل) */
  unknownHeaders: string[];
  teachers: string[];
  groups: string[];
  subjects: string[];
  uniqueStudents: number;
  /** صفوف اتخطّت (فاضية أو من غير اسم طالب) */
  skippedRows: number;
  warnings: string[];
  /** هل الملف شكله جدول سجلات فعلاً؟ */
  looksLikeTable: boolean;
}

export interface TableImportOptions {
  /** استخدام أسعار المواد من الكاتالوج/الإعدادات */
  useSubjectPrices: boolean;
  /** أسعار مخصّصة للمواد */
  subjectPrices?: SubjectPrices | null;
  /** سعر السجلات اللي مش معروفة مادتها ومفيهاش سعر */
  fallbackPrice: number;
  /** بداية أرقام التليفونات الـ placeholder */
  phonePrefix: string;
  /** أقصى عدد طلاب في المجموعة */
  maxStudents: number;
  /**
   * السعر المكتوب في الصف لو خالف سعر المادة يتسجّل كسعر خاص للتسجيل
   * (بدل ما يغيّر سعر الكورس على الكل).
   */
  rowPriceAsOverride: boolean;
}

export interface TableImportReport {
  teachersCreated: number;
  teachersExisting: number;
  coursesCreated: number;
  coursesExisting: number;
  groupsCreated: number;
  groupsExisting: number;
  studentsCreated: number;
  studentsExisting: number;
  studentsMatchedByPhone: number;
  enrollmentsCreated: number;
  enrollmentsSkipped: number;
  /** تسجيلات اتعملها سعر خاص لأن الصف كان فيه سعر مختلف */
  priceOverrides: number;
  /** سجلات مش معروفة مادتها */
  rowsWithoutSubject: number;
  subjectsUsed: { id: SubjectId; name: string; price: number; groups: number; students: number }[];
  errors: string[];
}
