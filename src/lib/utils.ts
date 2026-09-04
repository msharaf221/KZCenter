import dayjs from 'dayjs';
import 'dayjs/locale/ar';

dayjs.locale('ar');

export { dayjs };

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ==================== CSV UTILS ====================

export function toCSV(data: Record<string, unknown>[], headers: { key: string; label: string }[]): string {
  const headerRow = headers.map(h => `"${h.label}"`).join(',');
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h.key];
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );
  return [headerRow, ...rows].join('\n');
}

export function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

export function downloadCSV(content: string, filename: string): void {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(data: object, filename: string): void {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ==================== DATE UTILS ====================

export function formatDate(date: string | Date, format = 'YYYY/MM/DD'): string {
  return dayjs(date).format(format);
}

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('YYYY/MM/DD HH:mm');
}

export function getArabicDay(day: string): string {
  const map: Record<string, string> = {
    sunday: 'الأحد',
    monday: 'الاثنين',
    tuesday: 'الثلاثاء',
    wednesday: 'الأربعاء',
    thursday: 'الخميس',
    friday: 'الجمعة',
    saturday: 'السبت',
  };
  return map[day.toLowerCase()] || day;
}

// ==================== NUMBER UTILS ====================

export function formatCurrency(amount: number, currency = 'EGP'): string {
  return `${amount.toLocaleString('ar-EG')} ${currency}`;
}

/**
 * إرجاع لون نص قابل للقراءة (أبيض أو غامق) بناءً على سطوع لون الخلفية.
 * يحل مشكلة اختفاء النص الأبيض عند اختيار لون أساسي فاتح في الإعدادات.
 */
export function getContrastColor(hexColor: string): string {
  let hex = (hexColor || '').replace('#', '').trim();
  // Normalize shorthand (#rgb) to #rrggbb
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length !== 6) return '#ffffff';

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  if ([r, g, b].some(v => Number.isNaN(v))) return '#ffffff';

  // Relative luminance (perceived brightness)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e293b' : '#ffffff';
}

// ==================== VALIDATION ====================

export function validatePhone(phone: string): boolean {
  return /^[0-9+\-\s]{7,15}$/.test(phone.trim());
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==================== WHATSAPP UTILS ====================

export function getWhatsAppLink(phone: string, text: string = ''): string {
  if (!phone) return '#';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    cleaned = '2' + cleaned;
  }
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

// ==================== COLORS ====================

export const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#1e293b',
];

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-yellow-100 text-yellow-800',
    ended: 'bg-gray-100 text-gray-800',
    vacation: 'bg-blue-100 text-blue-800',
    open: 'bg-green-100 text-green-800',
    full: 'bg-orange-100 text-orange-800',
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    late: 'bg-red-100 text-red-800',
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    excused: 'bg-blue-100 text-blue-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'نشط',
    suspended: 'متوقف',
    ended: 'منتهي',
    vacation: 'إجازة',
    open: 'مفتوحة',
    full: 'مكتملة',
    paid: 'مدفوع',
    pending: 'معلق',
    late: 'متأخر',
    present: 'حاضر',
    absent: 'غائب',
    excused: 'مستأذن',
    male: 'ولد',
    female: 'بنت',
    subscription: 'اشتراك',
    books: 'كتب',
    other: 'أخرى',
    admin: 'مسؤول',
    teacher: 'مدرس',
    salaries: 'رواتب',
    bills: 'فواتير',
    maintenance: 'صيانة',
    purchases: 'مشتريات',
    rent: 'إيجار',
  };
  return map[status] || status;
}

// ==================== EXCEL UTILS ====================

export async function exportToExcel(
  data: Record<string, unknown>[],
  headers: { key: string; label: string }[],
  filename: string
): Promise<void> {
  const { utils, writeFile } = await import('xlsx');
  const wsData = [
    headers.map(h => h.label),
    ...data.map(row => headers.map(h => row[h.key] ?? '')),
  ];
  const ws = utils.aoa_to_sheet(wsData);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sheet1');
  writeFile(wb, filename);
}
