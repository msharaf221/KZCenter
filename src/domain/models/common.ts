// Shared model enums and unions

export type StudentStatus = 'active' | 'suspended' | 'ended';

export type Gender = 'male' | 'female';

export type TeacherStatus = 'active' | 'vacation' | 'suspended';

/**
 * طريقة حساب مستحقات المدرس:
 *  - fixed      → راتب شهري ثابت
 *  - per_session→ مبلغ لكل حصة مسلَّمة (بيتحسب من أيام الحضور المسجلة)
 *  - percentage → نسبة % من المحصّل فعلياً لمجموعاته في الشهر (توافق قديم)
 *  - subscription_percentage → نسبة من قيمة اشتراكات الشهر، سواء سُددت أم لا
 *  - per_group  → مبلغ ثابت لكل مجموعة في الشهر
 */
export type TeacherPayModel = 'fixed' | 'per_session' | 'percentage' | 'subscription_percentage' | 'per_group' | 'per_student';

export type GroupStatus = 'open' | 'full' | 'ended';

export type PaymentStatus = 'paid' | 'pending' | 'late';

export type PaymentType = 'subscription' | 'books' | 'other';

/** طريقة القبض — مطلوبة لمطابقة الخزينة والبنك/المحفظة */
export type PaymentMethod =
  | 'cash' // نقدي
  | 'wallet' // محفظة (فودافون كاش / اتصالات كاش / أورنج كاش)
  | 'instapay' // إنستاباي
  | 'card' // فيزا/ماستركارد (POS)
  | 'bank' // تحويل بنكي
  | 'other';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

/**
 * الأدوار:
 *  - admin      → كل حاجة
 *  - secretary  → استقبال: تسجيل طلاب/حضور/تحصيل، من غير مصروفات ولا رواتب ولا حذف
 *  - accountant → فلوس وتقارير مالية، من غير تعديل أكاديمي
 *  - supervisor → إشراف أكاديمي: مجموعات/حضور/اختبارات، من غير فلوس
 *  - teacher    → مجموعاته هو بس (حضور + درجات)
 * الصلاحيات التفصيلية في src/lib/permissions.ts
 */
export type UserRole = 'admin' | 'secretary' | 'accountant' | 'supervisor' | 'teacher';

export type ExpenseCategory = 'salaries' | 'bills' | 'maintenance' | 'purchases' | 'rent' | 'other';
