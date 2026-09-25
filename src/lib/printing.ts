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
import type { Settings, Student } from '../domain/models';
import { generateBarcodeSvg, generateQrSvg, getStudentCode } from './barcode';
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
 * بناء HTML إيصال حراري (POS Thermal Printer 80mm أو 58mm)
 */
export function buildThermalReceiptHtml(
  opts: ReceiptData & { settings?: Settings | null },
  widthMm: 80 | 58 = 80,
): string {
  const { settings } = opts;
  const barcode = opts.receiptNo ? generateBarcodeSvg(opts.receiptNo, { height: 32, showText: false }) : '';
  const maxWidth = widthMm === 80 ? '76mm' : '52mm';
  const fontSize = widthMm === 80 ? '12px' : '11px';

  return `
    ${fontLink()}
    <style>
      @page { margin: 0; size: ${widthMm}mm auto; }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 2mm 3mm; width: ${maxWidth};
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        direction: rtl; color: #000; background: #fff; font-size: ${fontSize}; line-height: 1.35;
      }
      .center-name { text-align: center; font-size: 15px; font-weight: 800; margin-bottom: 2px; }
      .center-sub { text-align: center; font-size: 10px; color: #444; margin-bottom: 4px; }
      .divider { border-top: 1px dashed #000; margin: 4px 0; }
      .double-divider { border-top: 2px solid #000; margin: 5px 0; }
      .title { text-align: center; font-weight: 700; font-size: 13px; margin: 3px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; font-size: ${fontSize}; }
      .row .label { color: #333; }
      .row .val { font-weight: 700; text-align: left; }
      .amount-box { text-align: center; padding: 6px; margin: 5px 0; border: 1px dashed #000; }
      .amount-val { font-size: 17px; font-weight: 800; }
      .amount-words { font-size: 10px; margin-top: 2px; }
      .footer { text-align: center; font-size: 9px; color: #333; margin-top: 6px; }
      .barcode-box { text-align: center; margin: 4px 0; }
      @media print {
        body { width: 100%; margin: 0; padding: 1mm 2mm; }
        .no-print { display: none !important; }
      }
    </style>
    <div class="thermal-ticket">
      <div class="center-name">${escapeHtml(settings?.centerName || opts.centerName)}</div>
      ${settings?.phone ? `<div class="center-sub">هاتف: ${escapeHtml(settings.phone)}</div>` : ''}
      <div class="divider"></div>
      <div class="title">إيصال استلام نقدية</div>
      <div class="row"><span class="label">رقم الإيصال:</span><span class="val font-mono">${escapeHtml(opts.receiptNo || '—')}</span></div>
      <div class="row"><span class="label">التاريخ:</span><span class="val">${formatDate(opts.date, 'YYYY/MM/DD HH:mm')}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">الطالب:</span><span class="val">${escapeHtml(opts.studentName)}</span></div>
      ${opts.groupName ? `<div class="row"><span class="label">المجموعة:</span><span class="val">${escapeHtml(opts.groupName)}</span></div>` : ''}
      ${opts.courseName ? `<div class="row"><span class="label">الكورس:</span><span class="val">${escapeHtml(opts.courseName)}</span></div>` : ''}
      <div class="row"><span class="label">البند:</span><span class="val">${escapeHtml(opts.type || 'اشتراك')}</span></div>
      <div class="row"><span class="label">طريقة الدفع:</span><span class="val">${escapeHtml(opts.method || 'نقدي')}</span></div>
      <div class="double-divider"></div>
      <div class="amount-box">
        <div class="amount-val">${escapeHtml(formatCurrency(opts.amount, settings?.currency))}</div>
        ${opts.amountInWords ? `<div class="amount-words">${escapeHtml(opts.amountInWords)}</div>` : ''}
      </div>
      ${opts.remainingAfter !== undefined ? `
        <div class="row"><span class="label">المتبقي بعد الدفعة:</span><span class="val">${formatCurrency(opts.remainingAfter, settings?.currency)}</span></div>
      ` : ''}
      ${opts.collectorName ? `<div class="row"><span class="label">المستلم:</span><span class="val">${escapeHtml(opts.collectorName)}</span></div>` : ''}
      ${barcode ? `<div class="barcode-box">${barcode}</div>` : ''}
      <div class="divider"></div>
      <div class="footer">${escapeHtml(settings?.receiptFooter || 'شكراً لتعاملكم معنا · المركز التعليمي')}</div>
    </div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };${SCRIPT_CLOSE}
  `;
}

/**
 * بناء HTML إيصال الاستلام — يدعم التخطيط العادي والتخطيط الحراري (80 مم / 58 مم)
 */
export function buildReceiptHtml(opts: ReceiptData & { settings?: Settings | null }): string {
  const { settings } = opts;
  if (settings?.receiptLayout === 'thermal80') {
    return buildThermalReceiptHtml(opts, 80);
  }
  if (settings?.receiptLayout === 'thermal58') {
    return buildThermalReceiptHtml(opts, 58);
  }

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
 */
export function printReceipt(opts: ReceiptData & { settings?: Settings | null }): string {
  const html = buildReceiptHtml(opts);
  openPrintWindow(html, `إيصال ${opts.receiptNo || ''}`.trim());
  return html;
}

export interface StudentCardPrintOptions {
  settings?: Settings | null;
  groupName?: string;
  courseName?: string;
}

/**
 * بناء قالب بطاقة/كارنيه الطالب المطبوع (CR80 Badge Format) مع باركود و QR
 */
export function buildStudentCardHtml(student: Student, opts: StudentCardPrintOptions = {}): string {
  const { settings, groupName, courseName } = opts;
  const primary = settings?.primaryColor || '#6366f1';
  const code = getStudentCode(student);
  const barcodeSvg = generateBarcodeSvg(code, { height: 38, showText: true });
  const qrSvg = generateQrSvg(code, { size: 68 });
  const centerName = settings?.centerName || 'المركز التعليمي';

  return `
    ${fontLink()}
    <style>
      @page { margin: 6mm; size: auto; }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 16px;
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        direction: rtl; background: #fff;
      }
      .card-wrap {
        width: 340px; height: 215px; border-radius: 14px;
        border: 2px solid ${primary}; overflow: hidden;
        box-shadow: 0 4px 14px rgba(0,0,0,0.08); background: #ffffff;
        display: flex; flex-direction: column; justify-content: space-between;
        margin: 0 auto 16px; page-break-inside: avoid; position: relative;
      }
      .card-header {
        background: ${primary}; color: #fff; padding: 8px 12px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .card-header .title { font-size: 13px; font-weight: 800; }
      .card-header .badge { font-size: 10px; background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 6px; }
      .card-body {
        padding: 8px 12px; display: flex; gap: 10px; align-items: center; flex: 1;
      }
      .avatar-box {
        width: 62px; height: 62px; border-radius: 12px; background: #f1f5f9;
        border: 1.5px solid #cbd5e1; display: flex; align-items: center; justify-content: center;
        overflow: hidden; font-size: 26px; flex-shrink: 0;
      }
      .avatar-box img { width: 100%; height: 100%; object-fit: cover; }
      .info-box { flex: 1; min-width: 0; font-size: 11px; }
      .student-name { font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .info-line { color: #475569; margin: 1px 0; display: flex; gap: 4px; }
      .info-line b { color: #0f172a; }
      .card-footer {
        background: #f8fafc; border-top: 1px dashed #cbd5e1; padding: 6px 10px;
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
      }
      .barcode-area { flex: 1; overflow: hidden; }
      .qr-area { width: 68px; height: 68px; flex-shrink: 0; }
      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
      }
    </style>
    <div class="card-wrap">
      <div class="card-header">
        <span class="title">${escapeHtml(centerName)}</span>
        <span class="badge">بطاقة طالب</span>
      </div>
      <div class="card-body">
        <div class="avatar-box">
          ${student.avatar ? `<img src="${escapeHtml(student.avatar)}" alt="avatar" />` : (student.gender === 'female' ? '👧' : '👦')}
        </div>
        <div class="info-box">
          <div class="student-name">${escapeHtml(student.name)}</div>
          <div class="info-line"><span>الكود:</span><b class="font-mono text-indigo-700">${escapeHtml(code)}</b></div>
          ${student.gradeLevel ? `<div class="info-line"><span>الصف:</span><b>${escapeHtml(student.gradeLevel)}</b></div>` : ''}
          ${groupName ? `<div class="info-line"><span>المجموعة:</span><b>${escapeHtml(groupName)}</b></div>` : ''}
          ${courseName ? `<div class="info-line"><span>الكورس:</span><b>${escapeHtml(courseName)}</b></div>` : ''}
          <div class="info-line"><span>ولي الأمر:</span><b>${escapeHtml(student.parentPhone)}</b></div>
        </div>
      </div>
      <div class="card-footer">
        <div class="barcode-area">${barcodeSvg}</div>
        <div class="qr-area">${qrSvg}</div>
      </div>
    </div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };${SCRIPT_CLOSE}
  `;
}

/**
 * طباعة كارنيه طالب فردي
 */
export function printStudentCard(student: Student, opts: StudentCardPrintOptions = {}): void {
  const html = buildStudentCardHtml(student, opts);
  openPrintWindow(html, `كارنيه — ${student.name}`);
}

/**
 * طباعة كارنيهات مجموعة من الطلاب في ورقة A4
 */
export function printBatchStudentCards(students: Student[], opts: StudentCardPrintOptions = {}): void {
  const { settings, groupName, courseName } = opts;
  const primary = settings?.primaryColor || '#6366f1';
  const centerName = settings?.centerName || 'المركز التعليمي';

  const cardsHtml = students.map(student => {
    const code = getStudentCode(student);
    const barcodeSvg = generateBarcodeSvg(code, { height: 34, showText: true });
    const qrSvg = generateQrSvg(code, { size: 60 });
    return `
      <div class="card-wrap">
        <div class="card-header">
          <span class="title">${escapeHtml(centerName)}</span>
          <span class="badge">بطاقة طالب</span>
        </div>
        <div class="card-body">
          <div class="avatar-box">
            ${student.avatar ? `<img src="${escapeHtml(student.avatar)}" alt="avatar" />` : (student.gender === 'female' ? '👧' : '👦')}
          </div>
          <div class="info-box">
            <div class="student-name">${escapeHtml(student.name)}</div>
            <div class="info-line"><span>الكود:</span><b class="font-mono">${escapeHtml(code)}</b></div>
            ${student.gradeLevel ? `<div class="info-line"><span>الصف:</span><b>${escapeHtml(student.gradeLevel)}</b></div>` : ''}
            ${groupName ? `<div class="info-line"><span>المجموعة:</span><b>${escapeHtml(groupName)}</b></div>` : ''}
            ${courseName ? `<div class="info-line"><span>الكورس:</span><b>${escapeHtml(courseName)}</b></div>` : ''}
            <div class="info-line"><span>ولي الأمر:</span><b>${escapeHtml(student.parentPhone)}</b></div>
          </div>
        </div>
        <div class="card-footer">
          <div class="barcode-area">${barcodeSvg}</div>
          <div class="qr-area">${qrSvg}</div>
        </div>
      </div>
    `;
  }).join('');

  const fullHtml = `
    ${fontLink()}
    <style>
      @page { margin: 8mm; size: A4; }
      * { box-sizing: border-box; }
      body {
        margin: 0; padding: 12px;
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        direction: rtl; background: #fff;
      }
      .grid-container {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
      }
      .card-wrap {
        border-radius: 12px; border: 1.5px solid ${primary}; overflow: hidden;
        background: #ffffff; display: flex; flex-direction: column; justify-content: space-between;
        page-break-inside: avoid; height: 200px;
      }
      .card-header {
        background: ${primary}; color: #fff; padding: 6px 10px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .card-header .title { font-size: 12px; font-weight: 800; }
      .card-header .badge { font-size: 9px; background: rgba(255,255,255,0.2); padding: 1px 5px; border-radius: 5px; }
      .card-body {
        padding: 6px 10px; display: flex; gap: 8px; align-items: center; flex: 1;
      }
      .avatar-box {
        width: 52px; height: 52px; border-radius: 10px; background: #f1f5f9;
        border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center;
        overflow: hidden; font-size: 22px; flex-shrink: 0;
      }
      .avatar-box img { width: 100%; height: 100%; object-fit: cover; }
      .info-box { flex: 1; min-width: 0; font-size: 10.5px; }
      .student-name { font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .info-line { color: #475569; margin: 1px 0; display: flex; gap: 4px; }
      .info-line b { color: #0f172a; }
      .card-footer {
        background: #f8fafc; border-top: 1px dashed #cbd5e1; padding: 4px 8px;
        display: flex; align-items: center; justify-content: space-between; gap: 4px;
      }
      .barcode-area { flex: 1; overflow: hidden; }
      .qr-area { width: 60px; height: 60px; flex-shrink: 0; }
      @media print {
        body { padding: 0; }
        .no-print { display: none !important; }
      }
    </style>
    <div class="grid-container">
      ${cardsHtml}
    </div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };${SCRIPT_CLOSE}
  `;

  openPrintWindow(fullHtml, `كارنيهات الطلاب (${students.length})`);
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
