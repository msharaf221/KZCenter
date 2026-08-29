/**
 * i18n Tests
 * اختبارات نظام الترجمة
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { t, setLocale, getLocale, isRTL } from '../i18n';

beforeEach(() => {
  setLocale('ar');
});

describe('i18n Translation System', () => {
  it('returns Arabic translation by default', () => {
    expect(t('app.name')).toBe('EduCenter Pro');
    expect(t('nav.dashboard')).toBe('لوحة التحكم');
  });

  it('returns English translation when locale is set', () => {
    setLocale('en');
    expect(t('nav.dashboard')).toBe('Dashboard');
    expect(t('common.save')).toBe('Save');
  });

  it('returns key when translation is missing', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('handles parameters', () => {
    setLocale('ar');
    const result = t('auth.remainingAttempts', { count: 3 });
    expect(result).toContain('3');
    expect(result).toContain('محاولات');
  });

  it('handles multiple parameters', () => {
    setLocale('ar');
    const result = t('attendance.saved', { count: 10, group: 'الصف الأول' });
    expect(result).toContain('10');
    expect(result).toContain('الصف الأول');
  });

  it('returns correct locale', () => {
    expect(getLocale()).toBe('ar');
    setLocale('en');
    expect(getLocale()).toBe('en');
  });

  it('returns correct RTL status', () => {
    expect(isRTL()).toBe(true);
    setLocale('en');
    expect(isRTL()).toBe(false);
  });

  it('sets document direction for Arabic', () => {
    setLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('sets document direction for English', () => {
    setLocale('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('has all required Arabic keys', () => {
    const requiredKeys = [
      'app.name',
      'nav.dashboard',
      'nav.students',
      'common.save',
      'common.cancel',
      'status.active',
      'auth.login',
    ];
    requiredKeys.forEach(key => {
      expect(t(key)).not.toBe(key);
    });
  });

  it('has all required English keys', () => {
    setLocale('en');
    const requiredKeys = [
      'app.name',
      'nav.dashboard',
      'nav.students',
      'common.save',
      'common.cancel',
      'status.active',
      'auth.login',
    ];
    requiredKeys.forEach(key => {
      expect(t(key)).not.toBe(key);
    });
  });
});
