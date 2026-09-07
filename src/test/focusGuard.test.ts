/**
 * اختبارات Focus Guard
 *
 * باغ معروف في Electron على ويندوز: بعد أي نافذة نظام أصلية
 * (alert/confirm، حوار الطباعة، حوار اختيار ملفات، نافذة منبثقة
 * بتتقفل) النافذة الرئيسية بتفقد حالة الفوكس الصح، فقوائم `<select>`
 * بتفتح وتقفل فوراً لوحدها (electron/electron#31917 و#41603).
 * الـ guard بيغلّف كل المصادر دي ويطلب استرداد الفوكس بعد ما تتقفل.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFocusGuard, _resetFocusGuardForTests } from '../lib/focusGuard';

describe('focusGuard', () => {
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;
  const originalPrint = window.print;
  const originalOpen = window.open;
  const originalElectronAPI = window.electronAPI;

  function mockElectron(refocus: ReturnType<typeof vi.fn>) {
    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      window: { refocus },
    } as unknown as ElectronAPI;
  }

  beforeEach(() => {
    _resetFocusGuardForTests();
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    window.print = originalPrint;
    window.open = originalOpen;
    window.electronAPI = undefined;
  });

  afterEach(() => {
    _resetFocusGuardForTests();
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    window.print = originalPrint;
    window.open = originalOpen;
    window.electronAPI = originalElectronAPI;
    vi.restoreAllMocks();
  });

  it('لا يغلّف النوافذ الأصلية خارج Electron', () => {
    installFocusGuard();
    // ما يجبش يستبدل الدوال الأصلية (التغليف للإلكترون فقط)
    expect(window.confirm).toBe(originalConfirm);
    expect(window.alert).toBe(originalAlert);
    expect(window.print).toBe(originalPrint);
    expect(window.open).toBe(originalOpen);
  });

  it('يغلّف confirm وalert داخل Electron ويرجّع نفس النتيجة', () => {
    const refocus = vi.fn();
    mockElectron(refocus);

    const nativeConfirm = vi.fn().mockReturnValue(true);
    const nativeAlert = vi.fn();
    window.confirm = nativeConfirm as unknown as typeof window.confirm;
    window.alert = nativeAlert as unknown as typeof window.alert;

    installFocusGuard();

    const result = window.confirm('متأكد؟');
    expect(nativeConfirm).toHaveBeenCalledWith('متأكد؟');
    expect(result).toBe(true);
    // بيطلب استرداد الفوكس فوراً + مرة تأمين بعد شوية
    expect(refocus).toHaveBeenCalledTimes(1);

    window.alert('تنبيه');
    expect(nativeAlert).toHaveBeenCalledWith('تنبيه');
    expect(refocus).toHaveBeenCalledTimes(2);
  });

  it('يغلّف window.print ويطلب استرداد الفوكس بعد حوار الطباعة', () => {
    const refocus = vi.fn();
    mockElectron(refocus);

    const nativePrint = vi.fn();
    window.print = nativePrint as unknown as typeof window.print;

    installFocusGuard();
    window.print();

    expect(nativePrint).toHaveBeenCalledTimes(1);
    // استرداد فوري بعد ما حوار الطباعة يتقفل (window.print متزامنة)
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it('يغلّف window.open ويشفّي الفوكس عند رجوع النافذة الرئيسية', () => {
    const refocus = vi.fn();
    mockElectron(refocus);

    const fakeWin = { closed: false, document: { write: vi.fn(), close: vi.fn(), open: vi.fn() } };
    const nativeOpen = vi.fn().mockReturnValue(fakeWin);
    window.open = nativeOpen as unknown as typeof window.open;

    installFocusGuard();
    const win = window.open('', '_blank');

    // النافذة المنبثقة نفسها مش بتكسر حاجة لسه — مفيش استرداد فوري
    expect(nativeOpen).toHaveBeenCalledWith('', '_blank');
    expect(win).toBe(fakeWin);
    expect(refocus).not.toHaveBeenCalled();

    // رجوع الفوكس للنافذة الرئيسية (مثلاً المستخدم ضغط عليها) → شفاء
    window.dispatchEvent(new Event('focus'));
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it('يطلب استرداد الفوكس عند اختيار ملف من حوار الملفات', () => {
    const refocus = vi.fn();
    mockElectron(refocus);

    installFocusGuard();

    const input = document.createElement('input');
    input.type = 'file';
    document.body.appendChild(input);

    // فتح حوار الملفات (ضغطة على input[type=file])
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // لسه مفيش استرداد — الحوار مفتوح
    expect(refocus).not.toHaveBeenCalled();

    // المستخدم اختار ملف → الحوار اتقفل → استرداد فوري
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(refocus).toHaveBeenCalledTimes(1);

    // ولما النافذة ترجع فوكسها برضو فيه جرعة شفاء (حوار الملفات بيأثر عليها)
    window.dispatchEvent(new Event('focus'));
    expect(refocus).toHaveBeenCalledTimes(2);

    document.body.removeChild(input);
  });

  it('لا يشفي على فوكس عنصر — ده كان هيقفل select المستخدم', () => {
    const refocus = vi.fn();
    mockElectron(refocus);

    installFocusGuard();

    // نعلّم إن فيه نافذة أصلية مفتوحة (زي حوار ملفات متلغي)
    const input = document.createElement('input');
    input.type = 'file';
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.body.removeChild(input);

    // فوكس عنصر عادي (حقل/قائمة) مش فوكس النافذة — ممنوع الشفاء هنا
    const select = document.createElement('select');
    document.body.appendChild(select);
    select.dispatchEvent(new Event('focus', { bubbles: false }));
    expect(refocus).not.toHaveBeenCalled();
    document.body.removeChild(select);

    // فوكس النافذة نفسها هو اللي بيشنّف
    window.dispatchEvent(new Event('focus'));
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it('التعليم بيفضل صالح لمرة واحدة بس (مفيش شفاء متكرر)', () => {
    const refocus = vi.fn();
    mockElectron(refocus);

    installFocusGuard();

    const input = document.createElement('input');
    input.type = 'file';
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.body.removeChild(input);

    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    // مرة واحدة بس مهما حصلت أحداث فوكس بعدها
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it('يستدعي الاسترداد المؤجل بعد مهلة قصيرة', async () => {
    vi.useFakeTimers();
    const refocus = vi.fn();
    mockElectron(refocus);
    window.confirm = vi.fn().mockReturnValue(false) as unknown as typeof window.confirm;

    installFocusGuard();
    expect(window.confirm('؟')).toBe(false);
    expect(refocus).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    expect(refocus).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('يركّب نفسه مرة واحدة فقط (idempotent)', () => {
    const refocus = vi.fn();
    mockElectron(refocus);
    const nativeConfirm = vi.fn().mockReturnValue(true);
    window.confirm = nativeConfirm as unknown as typeof window.confirm;

    installFocusGuard();
    const wrapped = window.confirm;
    installFocusGuard();
    // نفس الدالة الملفوفة — مفيش تغليف مزدوج
    expect(window.confirm).toBe(wrapped);

    window.confirm('x');
    expect(nativeConfirm).toHaveBeenCalledTimes(1);
  });

  it('يتحمل غياب window.refocus في النسخ القديمة من الـ preload', () => {
    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
    } as unknown as ElectronAPI;
    const nativeConfirm = vi.fn().mockReturnValue(true);
    window.confirm = nativeConfirm as unknown as typeof window.confirm;

    installFocusGuard();
    // ما يرميش خطأ رغم إن الـ preload القديم مفيش فيه window.refocus
    expect(() => window.confirm('x')).not.toThrow();
    expect(window.confirm('x')).toBe(true);
  });
});
