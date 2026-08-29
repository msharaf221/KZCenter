/**
 * Internationalization (i18n) system
 * نظام الترجمة والتعريب
 */

import ar from './locales/ar.json';
import en from './locales/en.json';

export type Locale = 'ar' | 'en';

const translations: Record<Locale, Record<string, string>> = { ar, en };

let currentLocale: Locale = 'ar';

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let translation = translations[currentLocale]?.[key] || translations.ar[key] || key;

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      translation = translation.replace(`{{${k}}}`, String(v));
    });
  }

  return translation;
}

export function isRTL(): boolean {
  return currentLocale === 'ar';
}
