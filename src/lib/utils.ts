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

export function formatPercent(value: number): string {
  return `${value}%`;
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
    male: 'ذكر',
    female: 'أنثى',
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

// ==================== PDF UTILS ====================

export async function exportToPDF(
  title: string,
  data: Record<string, unknown>[],
  headers: { key: string; label: string }[]
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(8);

  const headerLabels = headers.map(h => h.label);
  const rows = data.map(row => headers.map(h => String(row[h.key] ?? '')));

  let y = 35;
  const pageWidth = doc.internal.pageSize.width - 28;
  const colWidth = pageWidth / headers.length;
  const cellPadX = 2;

  // Draw header
  doc.setFillColor(99, 102, 241);
  doc.rect(14, y - 5, pageWidth, 10, 'F');
  doc.setTextColor(255, 255, 255);
  headerLabels.forEach((label, i) => {
    // Truncate header labels to reasonable width
    const maxChars = Math.floor(colWidth / 2.5);
    const truncated = label.length > maxChars ? label.substring(0, maxChars - 1) + '…' : label;
    doc.text(truncated, 14 + i * colWidth + cellPadX, y);
  });

  y += 10;
  doc.setTextColor(0, 0, 0);

  rows.forEach((row, rowIndex) => {
    // Calculate row height based on longest wrapped cell
    let maxLines = 1;
    row.forEach((cell) => {
      const maxCellWidth = colWidth - cellPadX * 2;
      const lines = doc.splitTextToSize(cell, maxCellWidth);
      if (lines.length > maxLines) maxLines = lines.length;
    });
    const rowHeight = Math.max(10, maxLines * 4.5);

    // Check page break
    if (y + rowHeight > doc.internal.pageSize.height - 20) {
      doc.addPage();
      y = 20;
    }

    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 5, pageWidth, rowHeight, 'F');
    }

    row.forEach((cell, i) => {
      const maxCellWidth = colWidth - cellPadX * 2;
      const lines = doc.splitTextToSize(cell, maxCellWidth);
      lines.forEach((line: string, lineIdx: number) => {
        doc.text(line, 14 + i * colWidth + cellPadX, y + lineIdx * 4.5);
      });
    });
    y += rowHeight;
  });

  doc.save(`${title}.pdf`);
}
