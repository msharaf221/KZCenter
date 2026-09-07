/**
 * Focus Guard — حماية شاملة من باغ الفوكس المعروف في Electron على ويندوز.
 *
 * المشكلة (موثقة في electron/electron#31917 و#41603):
 *   أي نافذة نظام أصلية بتاخد الفوكس من الـ renderer — وبعد ما تتقفل،
 *   النافذة الرئيسية ما بترجعش لحالة الفوكس الصح. النتيجة: كل قوائم
 *   `<select>` المنسدلة بتفتح وتقفل فوراً لوحدها، والحقول ممكن تبطل
 *   تستجيب — لحد ما التطبيق يتقفل ويتفتح من جديد.
 *
 * المصادر اللي بتكسر الفوكس (كلها موجودة في التطبيق):
 *   1. `window.alert()` / `window.confirm()` — نوافذ رسائل أصلية.
 *   2. `window.print()` — حوار الطباعة الأصلي (تقارير/إيصالات).
 *   3. `window.open()` — نوافذ الطباعة المنبثقة (إيصال كل دفعة!):
 *      النافذة الجديدة بتاخد الفوكس، ولما المستخدم يقفلها النافذة
 *      الرئيسية بترجع بحالة فوكس مكسورة.
 *   4. `input[type=file]` — حوار اختيار الملفات الأصلي (استيراد
 *      Excel/CSV، رفع شعار/صورة طالب).
 *   5. `dialog.showOpenDialog` من العملية الرئيسية (استعادة نسخة
 *      احتياطية) — بيتعالج في electron/main.ts مباشرة.
 *
 * الحل: بعد إغلاق أي نافذة أصلية بنطلب من العملية الرئيسية تعمل
 * `blur()` ورا `focus()` للنافذة — وده بيرجّع حالة الفوكس الصحيحة.
 *
 * آلية «الشفاء عند رجوع الفوكس»: بعض الحوارات (زي اختيار ملفات أو
 * النوافذ المنبثقة) بنعلّم إن فيه نافذة أصلية اتحركت، وأول ما النافذة
 * الرئيسية ترجع فوكسها بنشفي مرة واحدة. التعليم بيهزم تلقائياً بعد
 * مهلة عشان ما يفضلش معلّق.
 */

let installed = false;

/** مرجع للـ electronAPI وقت التركيب (بيفضل ثابت للمكوّنات الملفوفة). */
let api: ElectronAPI | null = null;

// النسخ الأصلية للدوال الملفوفة — محفوظة للاختبارات (إعادة الضبط).
let nativeConfirm: ((message?: string) => boolean) | null = null;
let nativeAlert: ((message?: string) => void) | null = null;
let nativePrint: (() => void) | null = null;
let nativeOpen: (typeof window)['open'] | null = null;

/** فيه نافذة أصلية اتفتحت وينبغي الشفاء عند رجوع فوكس النافذة؟ */
let healOnFocus = false;
/** صلاحية التعليم — بعد كده بيتجاهل (أمان من التعليق المفتوح). */
let healDeadline = 0;
/** مهلة التعليم: 5 دقايق كفاية لأي حوار ملفات/طباعة. */
const HEAL_WINDOW_MS = 5 * 60_000;

/** إخبار العملية الرئيسية إنها ترجّع حالة الفوكس (blur + focus). */
function refocus(): void {
  try {
    api?.window?.refocus();
    // جرعة تأمين: أحياناً الحدث الأصلي بيقفل بعد شوية — نكرر الطلب مرة.
    setTimeout(() => api?.window?.refocus(), 150);
  } catch {
    // إصلاح الفوكس مش حرج — ما نعطّلش الشغل لو فشل.
  }
}

/** تعليم: نافذة أصلية هتاخد الفوكس — نشفي أول ما النافذة ترجع. */
function markNativeDialogPending(): void {
  healOnFocus = true;
  healDeadline = Date.now() + HEAL_WINDOW_MS;
}

/** الشفاء المعلّق (لو موجود وصالح) — بيتنفذ مرة واحدة بس. */
function healIfPending(): void {
  if (!healOnFocus) return;
  healOnFocus = false;
  if (Date.now() > healDeadline) return;
  refocus();
}

function isFileInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && target.type === 'file';
}

/**
 * التقاط ضغطات اختيار الملفات (capture) — الليبلات بتوجّه الضغطة
 * للـ input نفسه فالالتقاط على مستوى الـ document بيشوفها كلها.
 */
function onCaptureClick(e: Event): void {
  if (isFileInput(e.target)) markNativeDialogPending();
}

/** اختيار ملف فعلاً → الحوار اتقفل → استرداد فوري للفوكس. */
function onCaptureChange(e: Event): void {
  if (isFileInput(e.target)) refocus();
}

/**
 * رجوع فوكس النافذة كلها → شفاء معلّق لو موجود.
 * مهم: هدف الحدث لازم يكون النافذة نفسها مش عنصر DOM، لأن أحداث
 * فوكس العناصر (حقل، select…) بتمر على الـ window في مرحلة الالتقاط —
 * لو شفينا عندها كنا قفلنا الـ select اللي المستخدم فاتحه بنفسه!
 * (هدف فوكس النافذة هو كائن Window — مش Node — فبنميّزه كده.)
 */
function onCaptureFocus(e: Event): void {
  if (e.target instanceof Node) return;
  healIfPending();
}

/** يلف كل النوافذ الأصلية بإصلاح الفوكس. بيتنفذ مرة واحدة بس. */
export function installFocusGuard(): void {
  if (installed || typeof window === 'undefined') return;

  const electronAPI = window.electronAPI;
  // الباغ بيظهر في Electron فقط — في المتصفح العادي كل ده سليم.
  if (!electronAPI?.isElectron) return;

  installed = true;
  api = electronAPI;

  // ---- 1) نوافذ الرسائل الأصلية ----
  const confirmImpl = window.confirm.bind(window);
  const alertImpl = window.alert.bind(window);
  nativeConfirm = confirmImpl;
  nativeAlert = alertImpl;
  window.confirm = (message?: string) => {
    const result = confirmImpl(message);
    refocus();
    return result;
  };
  window.alert = (message?: string) => {
    alertImpl(message);
    refocus();
  };

  // ---- 2) حوار الطباعة الأصلي (window.print) ----
  // window.print() متزامنة: بترجع بعد ما حوار الطباعة يتقفل.
  const printImpl = window.print.bind(window);
  nativePrint = printImpl;
  window.print = () => {
    markNativeDialogPending();
    printImpl();
    refocus();
  };

  // ---- 3) النوافذ المنبثقة (نوافذ الطباعة) ----
  // النافذة الجديدة بتاخد الفوكس. إغلاقها بيتعالج من العملية
  // الرئيسية (did-create-window → closed)، وهنا بنشفي لو المستخدم
  // رجع للنافذة الرئيسية والمنبثقة لسه مفتوحة.
  const openImpl = window.open.bind(window);
  nativeOpen = openImpl;
  window.open = ((...args: Parameters<(typeof window)['open']>) => {
    markNativeDialogPending();
    return openImpl(...args);
  }) as (typeof window)['open'];

  // ---- 4) حوارات اختيار الملفات ----
  document.addEventListener('click', onCaptureClick, true);
  document.addEventListener('change', onCaptureChange, true);

  // ---- 5) الشفاء عند رجوع فوكس النافذة ----
  window.addEventListener('focus', onCaptureFocus, true);
}

/** للاختبارات فقط: إعادة ضبط كاملة وإرجاع الدوال الأصلية. */
export function _resetFocusGuardForTests(): void {
  if (nativeConfirm) window.confirm = nativeConfirm;
  if (nativeAlert) window.alert = nativeAlert;
  if (nativePrint) window.print = nativePrint;
  if (nativeOpen) window.open = nativeOpen;
  nativeConfirm = null;
  nativeAlert = null;
  nativePrint = null;
  nativeOpen = null;

  document.removeEventListener('click', onCaptureClick, true);
  document.removeEventListener('change', onCaptureChange, true);
  window.removeEventListener('focus', onCaptureFocus, true);

  healOnFocus = false;
  healDeadline = 0;
  api = null;
  installed = false;
}
