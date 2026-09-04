/**
 * الطباعة والتصدير — بديل PDF العربي المكسور
 *
 * ليه مش jsPDF؟
 *  اختبرنا `exportToPDF` القديمة فعلياً: jsPDF بيكتب بخط `Helvetica`
 *  بترميز `WinAnsiEncoding`، فالنص العربي بيطلع glyphs مضروبة/مقطّعة
 *  (لا shaping ولا اتصال حروف ولا RTL). الحل الصحيح بدون إضافة خط عربي
 *  مدمج (~300KB base64) هو **الطباعة عبر HTML**: المتصفح بيرندر العربي
 *  بشكل مثالي، والمستخدم يقدر «حفظ كـ PDF» من نفس نافذة الطباعة.
 *
 * كل الدوال هنا بتفتح نافذة طباعة منسّقة RTL بشعار المركز وألوانه.
 */
import type { Settings } from './db';
import { formatCurrency, formatDate } from './utils';

// قفل تاج <script> مبني بالتجميع مش حرفياً:
// البناء (viteSingleFile) بيحقن الكود جوّه <script> في index.html،
// فلو كتبنا </script> كحرف واحد هيقفل التاج الخارجي بدري ويكسر الصفحة.
const SCRIPT_CLOSE = '</' + 'script>';

export interface PrintColumn<T = Record<string, unknown>> {
  key: keyof T & string;
  label: string;
  /** محاذاة العمود */
  align?: 'right' | 'center' | 'left';
  /** تنسيق خاص (مبلغ/تاريخ) */
  format?: 'currency' | 'date';
  width?: string;
}

export interface PrintOptions {
  title: string;
  subtitle?: string;
  settings?: Settings | null;
  /** سطور إضافية فوق الجدول (مثال: «من تاريخ … إلى …») */
  meta?: { label: string; value: string }[];
  /** إجماليات تحت الجدول */
  totals?: { label: string; value: string }[];
  footer?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function centerStyles(settings?: Settings | null): string {
  const primary = settings?.primaryColor || '#6366f1';
  return `
    :root { --primary: ${primary}; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      direction: rtl; margin: 0; padding: 24px; color: #0f172a; background: #fff;
    }
    .sheet { max-width: 1100px; margin: 0 auto; }
    .head { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid var(--primary); padding-bottom: 12px; margin-bottom: 16px; }
    .head img { width: 56px; height: 56px; object-fit: contain; border-radius: 10px; }
    .logo-fallback {
      width: 56px; height: 56px; border-radius: 12px; background: var(--primary); color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 24px;
    }
    .head h1 { font-size: 20px; margin: 0; }
    .head .sub { font-size: 12px; color: #475569; margin-top: 2px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 12px; color: #334155; margin-bottom: 12px; }
    .meta b { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
    th { background: var(--primary); color: #fff; font-weight: 700; font-size: 12px; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tfoot td { background: #f1f5f9; font-weight: 800; }
    .totals { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .totals div { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 12px; font-size: 12px; }
    .totals b { display: block; font-size: 15px; margin-top: 2px; }
    .foot { margin-top: 18px; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
    .sign { display: flex; justify-content: space-between; margin-top: 34px; font-size: 12px; color: #334155; }
    .sign div { width: 200px; border-top: 1px solid #94a3b8; padding-top: 4px; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
  `;
}

function openPrintWindow(html: string, title: string): Window | null {
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    // المتصفح منع النافذة المنبثقة — نطبع في الإطار الحالي بدل ما نفشل بصمت
    const old = document.body.innerHTML;
    document.body.innerHTML = html;
    window.print();
    document.body.innerHTML = old;
    window.location.reload();
    return null;
  }
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`);
  win.document.close();
  return win;
}

function fontLink(): string {
  return `<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">`;
}

function head(settings: Settings | null | undefined, title: string, subtitle?: string): string {
  const name = settings?.centerName || 'EduCenter Pro';
  const logo = settings?.logo
    ? `<img src="${escapeHtml(settings.logo)}" alt="logo" />`
    : `<div class="logo-fallback">${escapeHtml(name.charAt(0))}</div>`;
  const contact = [settings?.phone, settings?.address, settings?.email].filter(Boolean).join(' · ');

  return `
    <div class="head">
      ${logo}
      <div>
        <h1>${escapeHtml(name)}</h1>
        <div class="sub">${escapeHtml(title)}${subtitle ? ` — ${escapeHtml(subtitle)}` : ''}</div>
        ${contact ? `<div class="sub">${escapeHtml(contact)}</div>` : ''}
      </div>
    </div>`;
}

/**
 * طباعة/تصدير جدول (من نافذة الطباعة تقدر «Save as PDF»).
 * بديل سليم لـ `exportToPDF` اللي كانت بتكسر العربي.
 */
/**
 * بناء HTML الجدول — دالة نقية (بتُختبر من غير فتح نافذة).
 * `printTable` بتستخدمها وبتفتح نافذة الطباعة.
 */
export function buildTableHtml<T extends Record<string, unknown>>(opts: PrintOptions & {
  rows: T[];
  columns: PrintColumn<T>[];
}): string {
  const { rows, columns, settings, title, subtitle, meta, totals, footer } = opts;

  const thead = `<tr>${columns.map(c => `<th style="text-align:${c.align || 'right'}${c.width ? `;width:${c.width}` : ''}">${escapeHtml(c.label)}</th>`).join('')}</tr>`;

  const tbody = rows.map(row => `
    <tr>
      ${columns.map(c => {
        const raw = row[c.key];
        let value: string;
        if (c.format === 'currency') value = formatCurrency(Number(raw) || 0, settings?.currency);
        else if (c.format === 'date') value = raw ? formatDate(String(raw)) : '—';
        else value = raw === null || raw === undefined || raw === '' ? '—' : String(raw);
        return `<td style="text-align:${c.align || 'right'}">${escapeHtml(value)}</td>`;
      }).join('')}
    </tr>`).join('');

  const tfoot = totals && totals.length > 0
    ? `<tfoot><tr><td colspan="${columns.length}">${totals.map(t => `${escapeHtml(t.label)}: <b>${escapeHtml(t.value)}</b>`).join(' &nbsp;|&nbsp; ')}</td></tr></tfoot>`
    : '';

  const metaHtml = meta && meta.length > 0
    ? `<div class="meta">${meta.map(m => `<span>${escapeHtml(m.label)}: <b>${escapeHtml(m.value)}</b></span>`).join('')}</div>`
    : '';

  const totalsHtml = totals && totals.length > 0
    ? `<div class="totals">${totals.map(t => `<div>${escapeHtml(t.label)}<b>${escapeHtml(t.value)}</b></div>`).join('')}</div>`
    : '';

  const html = `
    ${fontLink()}
    <style>${centerStyles(settings)}</style>
    <div class="sheet">
      ${head(settings, title, subtitle)}
      ${metaHtml}
      <table>
        <thead>${thead}</thead>
        <tbody>${tbody || `<tr><td colspan="${columns.length}" style="text-align:center;padding:20px;color:#64748b">مفيش بيانات</td></tr>`}</tbody>
        ${tfoot}
      </table>
      ${totalsHtml}
      <div class="foot">
        ${escapeHtml(footer || settings?.receiptFooter || '')}
        <div style="margin-top:4px">طُبع في ${formatDate(new Date(), 'YYYY/MM/DD HH:mm')} · عدد الصفوف: ${rows.length}</div>
      </div>
    </div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };${SCRIPT_CLOSE}
  `;

  return html;
}

/** طباعة/تصدير جدول (من نافذة الطباعة تقدر «Save as PDF») */
export function printTable<T extends Record<string, unknown>>(opts: PrintOptions & {
  rows: T[];
  columns: PrintColumn<T>[];
}): void {
  openPrintWindow(buildTableHtml(opts), opts.title);
}

export interface ReceiptData {
  receiptNo?: string;
  centerName: string;
  studentName: string;
  groupName?: string;
  courseName?: string;
  amount: number;
  /** المبلغ بالحروف (اختياري) */
  amountInWords?: string;
  method?: string;
  type?: string;
  date: string;
  collectorName?: string;
  /** مستحقات قبل/بعد الدفعة */
  remainingBefore?: number;
  remainingAfter?: number;
  notes?: string;
}

/**
 * بناء HTML إيصال الاستلام — دالة نقية قابلة للاختبار.
 * رقم مسلسل + شعار + طريقة دفع + مين قبض + رصيد بعد الدفع
 * (النسخة القديمة كانت رقم عشوائي من UUID ومن غير طريقة دفع ولا اسم موظف).
 */
export function buildReceiptHtml(opts: ReceiptData & { settings?: Settings | null }): string {
  const { settings } = opts;
  const row = (label: string, value: string) =>
    `<div class="row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || '—')}</b></div>`;

  const html = `
    ${fontLink()}
    <style>
      ${centerStyles(settings)}
      .receipt { max-width: 420px; margin: 0 auto; border: 2px solid var(--primary); border-radius: 14px; padding: 18px; }
      .receipt h2 { text-align: center; margin: 6px 0 2px; font-size: 17px; }
      .receipt .no { text-align: center; font-size: 13px; color: #475569; margin-bottom: 12px; }
      .row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
      .row span { color: #64748b; }
      .amount { text-align: center; margin: 14px 0; padding: 10px; background: #f1f5f9; border-radius: 10px; }
      .amount b { font-size: 24px; color: var(--primary); display: block; }
      .amount small { color: #64748b; font-size: 11px; }
    </style>
    <div class="sheet">
      ${head(settings, 'إيصال استلام')}
      <div class="receipt">
        <h2>${escapeHtml(opts.centerName)}</h2>
        <div class="no">إيصال استلام نقدية · رقم ${escapeHtml(opts.receiptNo || '—')}</div>

        ${row('التاريخ', formatDate(opts.date, 'YYYY/MM/DD'))}
        ${row('استلمنا من', opts.studentName)}
        ${row('المجموعة', opts.groupName || '')}
        ${row('الكورس', opts.courseName || '')}
        ${row('البند', opts.type || 'اشتراك')}
        ${row('طريقة الدفع', opts.method || 'نقدي')}

        <div class="amount">
          <b>${escapeHtml(formatCurrency(opts.amount, settings?.currency))}</b>
          ${opts.amountInWords ? `<small>${escapeHtml(opts.amountInWords)}</small>` : ''}
        </div>

        ${opts.remainingBefore !== undefined ? row('المتبقي قبل الدفعة', formatCurrency(opts.remainingBefore, settings?.currency)) : ''}
        ${opts.remainingAfter !== undefined ? row('المتبقي بعد الدفعة', formatCurrency(opts.remainingAfter, settings?.currency)) : ''}
        ${row('الملاحظات', opts.notes || '')}
        ${row('بواسطة', opts.collectorName || '')}

        <div class="sign">
          <div>توقيع المستلم</div>
          <div>توقيع ولي الأمر</div>
        </div>
      </div>
      <div class="foot" style="text-align:center">
        ${escapeHtml(settings?.receiptFooter || 'هذا الإيصال معتمد إلكترونياً من نظام المركز')}
      </div>
    </div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };${SCRIPT_CLOSE}
  `;

  return html;
}

/**
 * إيصال استلام رسمي: رقم مسلسل + شعار + طريقة دفع + مين قبض + رصيد بعد الدفع.
 * (النسخة القديمة كانت رقم عشوائي من UUID ومن غير طريقة دفع ولا اسم موظف.)
 */
export function printReceipt(opts: ReceiptData & { settings?: Settings | null }): string {
  const html = buildReceiptHtml(opts);
  openPrintWindow(html, `إيصال ${opts.receiptNo || ''}`.trim());
  return html;
}

/**
 * عدد → كلمات عربية مبسطة (للإيصالات).
 * بيدعم لـ 999,999,999 + جنيه/قرش.
 */
export function amountToArabicWords(amount: number, currency = 'جنيه'): string {
  const value = Number.isFinite(Number(amount)) ? Math.abs(Number(amount)) : 0;
  let n = Math.floor(value);
  let piastres = Math.round((value - n) * 100);
  // التقريب ممكن يوصّل القروش لـ 100 (مثال: 10.999) → ترحّل لجنيه كامل
  if (piastres >= 100) { n += 1; piastres -= 100; }

  const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
    'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

  const under1000 = (x: number): string => {
    const parts: string[] = [];
    const h = Math.floor(x / 100);
    const rest = x % 100;
    if (h) parts.push(HUNDREDS[h]);
    if (rest) {
      if (rest < 20) parts.push(ONES[rest]);
      else {
        const t = Math.floor(rest / 10);
        const o = rest % 10;
        parts.push(o ? `${ONES[o]} و${TENS[t]}` : TENS[t]);
      }
    }
    return parts.join(' و');
  };

  if (n === 0 && piastres === 0) return `صفر ${currency}`;

  const chunks: { value: number; label: string; single: string }[] = [
    { value: Math.floor(n / 1_000_000), label: 'مليون', single: 'مليون' },
    { value: Math.floor((n % 1_000_000) / 1000), label: 'ألف', single: 'ألف' },
    { value: n % 1000, label: '', single: '' },
  ];

  const words: string[] = [];
  for (const c of chunks) {
    if (!c.value) continue;
    const text = under1000(c.value);
    if (!c.label) { words.push(text); continue; }
    if (c.value === 1) words.push(c.single);
    else if (c.value === 2) words.push(c.label === 'ألف' ? 'ألفان' : 'مليونان');
    else words.push(`${text} ${c.label}`);
  }

  let out = `${words.join(' و')} ${currency}`;
  if (piastres > 0) out += ` و${under1000(piastres)} قرش`;
  return out.trim();
}
