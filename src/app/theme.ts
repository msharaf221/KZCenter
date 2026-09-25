import type { Settings } from '../domain/models';

export function applyApplicationTheme(settings: Settings): void {
  const html = document.documentElement;
  html.style.setProperty('--primary', settings.primaryColor);
  html.classList.remove('font-sm', 'font-md', 'font-lg');
  html.classList.add(`font-${settings.fontSize}`);
  html.classList.toggle('dark', settings.darkMode);
}
