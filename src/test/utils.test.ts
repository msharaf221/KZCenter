/**
 * Utils Tests
 * اختبارات الأدوات المساعدة
 */

import { describe, it, expect } from 'vitest';
import {
  cn,
  formatDate,
  formatDateTime,
  formatCurrency,
  getArabicDay,
  getStatusLabel,
  getStatusColor,
  validatePhone,
  validateEmail,
  getWhatsAppLink,
  getContrastColor,
} from '../lib/utils';

describe('cn (className utility)', () => {
  it('joins class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('filters falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('returns empty string for no args', () => {
    expect(cn()).toBe('');
  });
});

describe('formatDate', () => {
  it('formats date correctly', () => {
    const result = formatDate('2024-01-15');
    expect(result).toBe('2024/01/15');
  });

  it('formats with custom format', () => {
    const result = formatDate('2024-01-15', 'DD/MM/YYYY');
    expect(result).toBe('15/01/2024');
  });
});

describe('formatDateTime', () => {
  it('formats datetime correctly', () => {
    const result = formatDateTime('2024-01-15T14:30:00');
    expect(result).toContain('2024');
    expect(result).toContain('14:30');
  });
});

describe('formatCurrency', () => {
  it('formats with default currency', () => {
    const result = formatCurrency(1000);
    expect(result).toContain('EGP');
  });

  it('formats with custom currency', () => {
    const result = formatCurrency(500, 'USD');
    expect(result).toContain('USD');
  });
});

describe('getArabicDay', () => {
  it('translates English days to Arabic', () => {
    expect(getArabicDay('sunday')).toBe('الأحد');
    expect(getArabicDay('monday')).toBe('الاثنين');
    expect(getArabicDay('friday')).toBe('الجمعة');
  });

  it('returns original for unknown days', () => {
    expect(getArabicDay('unknown')).toBe('unknown');
  });
});

describe('getStatusLabel', () => {
  it('translates status labels', () => {
    expect(getStatusLabel('active')).toBe('نشط');
    expect(getStatusLabel('paid')).toBe('مدفوع');
    expect(getStatusLabel('absent')).toBe('غائب');
  });

  it('returns original for unknown status', () => {
    expect(getStatusLabel('unknown')).toBe('unknown');
  });
});

describe('getStatusColor', () => {
  it('returns correct color classes', () => {
    expect(getStatusColor('active')).toContain('green');
    expect(getStatusColor('absent')).toContain('red');
    expect(getStatusColor('pending')).toContain('yellow');
  });
});

describe('validatePhone', () => {
  it('validates correct phone numbers', () => {
    expect(validatePhone('01012345678')).toBe(true);
    expect(validatePhone('+201012345678')).toBe(true);
    expect(validatePhone('1234567')).toBe(true);
  });

  it('rejects invalid phone numbers', () => {
    expect(validatePhone('')).toBe(false);
    expect(validatePhone('123')).toBe(false);
    expect(validatePhone('abc')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('validates correct emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@domain.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
  });
});

describe('getContrastColor', () => {
  it('returns dark text for light backgrounds', () => {
    expect(getContrastColor('#ffffff')).toBe('#1e293b');
    expect(getContrastColor('#ffd166')).toBe('#1e293b');
    expect(getContrastColor('#fef08a')).toBe('#1e293b');
  });

  it('returns white text for dark backgrounds', () => {
    expect(getContrastColor('#000000')).toBe('#ffffff');
    expect(getContrastColor('#6366f1')).toBe('#ffffff');
    expect(getContrastColor('#1e293b')).toBe('#ffffff');
  });

  it('handles shorthand hex and missing #', () => {
    expect(getContrastColor('#fff')).toBe('#1e293b');
    expect(getContrastColor('#abc')).toBe('#1e293b');
    expect(getContrastColor('000000')).toBe('#ffffff');
  });

  it('returns white fallback for invalid input', () => {
    expect(getContrastColor('')).toBe('#ffffff');
    expect(getContrastColor('not-a-color')).toBe('#ffffff');
  });
});

describe('getWhatsAppLink', () => {
  it('generates WhatsApp link', () => {
    const link = getWhatsAppLink('01012345678', 'Hello');
    expect(link).toContain('wa.me');
    expect(link).toContain('Hello');
  });

  it('returns # for empty phone', () => {
    expect(getWhatsAppLink('')).toBe('#');
  });
});
