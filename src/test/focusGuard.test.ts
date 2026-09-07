/**
 * اختبارات Focus Guard
 *
 * باغ معروف في Electron على ويندوز: بعد نافذة `alert()`/`confirm()` أصلية
 * النافذة الرئيسية بتفقد حالة الفوكس الصح، فقوائم `<select>` بتفتح وتقفل
 * فوراً لوحدها (electron/electron#31917 و#41603).
 * الـ guard بيغلّف النوافذ الأصلية ويطلب استرداد الفوكس بعد ما تتقفل.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFocusGuard, _resetFocusGuardForTests } from '../lib/focusGuard';

describe('focusGuard', () => {
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;
  const originalElectronAPI = window.electronAPI;

  beforeEach(() => {
    _resetFocusGuardForTests();
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    window.electronAPI = undefined;
  });

  afterEach(() => {
    _resetFocusGuardForTests();
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    window.electronAPI = originalElectronAPI;
    vi.restoreAllMocks();
  });

  it('لا يغلّف النوافذ الأصلية خارج Electron', () => {
    installFocusGuard();
    // ما يجبش يستبدل الدوال الأصلية (التغليف للإلكترون فقط)
    expect(window.confirm).toBe(originalConfirm);
    expect(window.alert).toBe(originalAlert);
  });

  it('يغلّف confirm وalert داخل Electron ويرجّع نفس النتيجة', () => {
    const refocus = vi.fn();
    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      window: { refocus },
    } as unknown as ElectronAPI;

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

  it('يستدعي الاسترداد المؤجل بعد مهلة قصيرة', async () => {
    vi.useFakeTimers();
    const refocus = vi.fn();
    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      window: { refocus },
    } as unknown as ElectronAPI;
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
    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      window: { refocus },
    } as unknown as ElectronAPI;
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
