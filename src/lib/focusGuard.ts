/**
 * Focus Guard — إصلاح باغ الفوكس المعروف في Electron على ويندوز.
 *
 * المشكلة (موثقة في electron/electron#31917 و#41603):
 *   لما الـ renderer يعرض نافذة نظام أصلية (`alert()` / `confirm()`)،
 *   Window الرئيسي ما بيستردش حالة الفوكس صح بعد ما النافذة تتقفل.
 *   النتيجة: كل قوائم `<select>` المنسدلة بتفتح وتقفل فوراً لوحدها،
 *   والحقول ممكن تبطل تستجيب — لحد ما التطبيق يتقفل ويتفتح من جديد.
 *
 * الحل هنا: بنغلّف `window.confirm` و`window.alert` بحيث بعد ما النافذة
 * الأصلية تتقفل بنطلب من العملية الرئيسية (main process) يعمل
 * `blur()` ورا `focus()` للنافذة — وده بيرجّع حالة الفوكس الصحيحة.
 *
 * مع كده، كل استخدامات `confirm()` في التطبيق اتحولت لـ ConfirmDialog
 * (مكوّن React) عشان النافذة الأصلية ما تظهرش أصلاً — ده الإصلاح الأساسي.
 * الـ guard ده شبكة أمان لأي استخدام مستقبلي.
 */

let installed = false;

/** يلف الـ native dialogs بإصلاح الفوكس. بيتنفذ مرة واحدة بس. */
export function installFocusGuard(): void {
  if (installed || typeof window === 'undefined') return;

  const api = window.electronAPI;
  // الباغ بيظهر في Electron فقط — في المتصفح العادي الـ native dialogs سليمة.
  if (!api?.isElectron) return;

  installed = true;

  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);

  const refocus = () => {
    try {
      window.electronAPI?.window?.refocus();
      // جرعة تأمين: أحياناً الحدث الأصلي بيقفل بعد شوية — نكرر الطلب مرة.
      setTimeout(() => window.electronAPI?.window?.refocus(), 150);
    } catch {
      // إصلاح الفوكس مش حرج — ما نعطّلش الشغل لو فشل.
    }
  };

  window.confirm = (message?: string) => {
    const result = nativeConfirm(message);
    refocus();
    return result;
  };

  window.alert = (message?: string) => {
    nativeAlert(message);
    refocus();
  };
}

/** للاختبارات فقط: إعادة ضبط حالة التركيب. */
export function _resetFocusGuardForTests(): void {
  installed = false;
}
