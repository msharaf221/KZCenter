import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '../domain/searchText';

describe('normalizeSearchText', () => {
  it('normalizes common Arabic spelling differences and diacritics', () => {
    expect(normalizeSearchText('إبراهيم مُحمّد')).toBe('ابراهيم محمد');
    expect(normalizeSearchText('مدرسة هدى')).toBe('مدرسه هدي');
  });

  it('normalizes Arabic and Persian numerals for phone searches', () => {
    expect(normalizeSearchText('٠١٠ ۱۲۳')).toBe('010 123');
  });

  it('treats empty values safely', () => {
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
  });
});
