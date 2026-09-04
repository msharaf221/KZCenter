/**
 * اختبارات الطباعة — دوال نقية في src/lib/printing.ts
 *
 * الطباعة بقت بديل jsPDF: jsPDF كان بيطلّع عربي مكسّر (لا تشكيل ولا RTL).
 * هنا بنتأكد من:
 *  - تحويل المبلغ لحروف عربية (بيظهر في الإيصال الرسمي)
 *  - بناء HTML الجدول والإيصال (RTL + تنفيل المدخلات ضد XSS)
 */
import { describe, it, expect } from 'vitest';
import { amountToArabicWords, buildTableHtml, buildReceiptHtml, type PrintColumn } from '../lib/printing';
import type { Settings } from '../lib/db';
import { formatCurrency } from '../lib/utils';

const settings: Settings = {
  id: 'main',
  centerName: 'مركز الأمل التعليمي',
  address: '12 شارع التحرير',
  phone: '01000000000',
  currency: 'ج.م',
  primaryColor: '#4f46e5',
  fontSize: 'md',
  darkMode: false,
  notifyNewStudent: true,
  notifyAbsence: true,
  notifyLatePayment: true,
};

describe('amountToArabicWords — مبالغ بسيطة', () => {
  it('صفر', () => {
    expect(amountToArabicWords(0)).toBe('صفر جنيه');
  });

  it('آحاد', () => {
    expect(amountToArabicWords(1)).toBe('واحد جنيه');
    expect(amountToArabicWords(5)).toBe('خمسة جنيه');
    expect(amountToArabicWords(9)).toBe('تسعة جنيه');
  });

  it('عشرات', () => {
    expect(amountToArabicWords(10)).toBe('عشرة جنيه');
    expect(amountToArabicWords(11)).toBe('أحد عشر جنيه');
    expect(amountToArabicWords(15)).toBe('خمسة عشر جنيه');
    expect(amountToArabicWords(20)).toBe('عشرون جنيه');
    expect(amountToArabicWords(21)).toBe('واحد وعشرون جنيه');
    expect(amountToArabicWords(99)).toBe('تسعة وتسعون جنيه');
  });

  it('مئات', () => {
    expect(amountToArabicWords(100)).toBe('مئة جنيه');
    expect(amountToArabicWords(200)).toBe('مئتان جنيه');
    expect(amountToArabicWords(300)).toBe('ثلاثمئة جنيه');
    expect(amountToArabicWords(150)).toBe('مئة وخمسون جنيه');
    expect(amountToArabicWords(999)).toBe('تسعمئة وتسعة وتسعون جنيه');
  });
});

describe('amountToArabicWords — آلاف وملايين', () => {
  it('ألف مفرد', () => {
    expect(amountToArabicWords(1000)).toBe('ألف جنيه');
  });

  it('ألفان', () => {
    expect(amountToArabicWords(2000)).toBe('ألفان جنيه');
  });

  it('آلاف', () => {
    expect(amountToArabicWords(3000)).toBe('ثلاثة ألف جنيه');
    expect(amountToArabicWords(5000)).toBe('خمسة ألف جنيه');
    expect(amountToArabicWords(11000)).toBe('أحد عشر ألف جنيه');
  });

  it('آلاف مع باقي', () => {
    expect(amountToArabicWords(2500)).toBe('ألفان وخمسمئة جنيه');
    expect(amountToArabicWords(1800)).toBe('ألف وثمانمئة جنيه');
    expect(amountToArabicWords(10050)).toBe('عشرة ألف وخمسون جنيه');
  });

  it('مليون', () => {
    expect(amountToArabicWords(1000000)).toBe('مليون جنيه');
    expect(amountToArabicWords(2000000)).toBe('مليونان جنيه');
  });

  it('أرقام مركبة كبيرة', () => {
    const out = amountToArabicWords(1234567);
    expect(out).toContain('مليون');
    expect(out).toContain('ألف');
    expect(out.endsWith('جنيه')).toBe(true);
  });
});

describe('amountToArabicWords — قروش وحالات حدّية', () => {
  it('القروش بتتضاف', () => {
    expect(amountToArabicWords(100.5)).toBe('مئة جنيه وخمسون قرش');
    expect(amountToArabicWords(0.25)).toContain('قرش');
    expect(amountToArabicWords(0.25)).toContain('خمسة وعشرون');
  });

  it('من غير قروش مفيش ذكر للقرش', () => {
    expect(amountToArabicWords(100)).not.toContain('قرش');
  });

  it('العملة المخصصة', () => {
    expect(amountToArabicWords(50, 'ريال')).toBe('خمسون ريال');
    expect(amountToArabicWords(50, 'ج.م')).toBe('خمسون ج.م');
  });

  it('القيم السالبة بتتعامل كقيمة مطلقة (الإيصال ما بيكتبش سالب)', () => {
    expect(amountToArabicWords(-500)).toBe(amountToArabicWords(500));
  });

  it('قيم غير رقمية ما تكسرش', () => {
    expect(amountToArabicWords(NaN)).toBe('صفر جنيه');
    expect(amountToArabicWords(undefined as unknown as number)).toBe('صفر جنيه');
  });

  it('الكسور بتتقرب لأقرب قرش', () => {
    expect(amountToArabicWords(10.005)).toContain('قرش');
    // 10.999 → القروش بتوصل 100 فبتترحّل لجنيه كامل
    expect(amountToArabicWords(10.999)).toBe('أحد عشر جنيه');
    expect(amountToArabicWords(10.5)).toBe('عشرة جنيه وخمسون قرش');
  });

  it('مبالغ نموذجية للإيصالات', () => {
    expect(amountToArabicWords(800)).toBe('ثمانمئة جنيه');
    expect(amountToArabicWords(1200)).toBe('ألف ومئتان جنيه');
    expect(amountToArabicWords(4500)).toBe('أربعة ألف وخمسمئة جنيه');
  });
});

describe('buildTableHtml — بناء HTML الجدول', () => {
  const columns: PrintColumn[] = [
    { key: 'name', label: 'الاسم' },
    { key: 'amount', label: 'المبلغ', format: 'currency' },
    { key: 'date', label: 'التاريخ', format: 'date' },
  ];
  const rows = [
    { name: 'أحمد محمد', amount: 800, date: '2026-03-10' },
    { name: 'منى علي', amount: 1200, date: '2026-03-11' },
  ];

  it('HTML فيه الجدول والعنوان (الـ doctype بيتلف وقت فتح النافذة)', () => {
    const html = buildTableHtml({ title: 'تقرير المدفوعات', columns, rows });
    expect(html).toContain('<table');
    expect(html).toContain('</table>');
    expect(html).toContain('تقرير المدفوعات');
  });

  it('العنوان والعناوين الفرعية ظاهرة', () => {
    const html = buildTableHtml({ title: 'تقرير المدفوعات', subtitle: 'عن شهر مارس', columns, rows });
    expect(html).toContain('تقرير المدفوعات');
    expect(html).toContain('عن شهر مارس');
  });

  it('اتجاه RTL في الستايل', () => {
    const html = buildTableHtml({ title: 'ت', columns, rows });
    expect(html).toContain('direction: rtl');
  });

  it('كل الصفوف والأعمدة بتظهر', () => {
    const html = buildTableHtml({ title: 'ت', columns, rows });
    expect(html).toContain('الاسم');
    expect(html).toContain('المبلغ');
    expect(html).toContain('أحمد محمد');
    expect(html).toContain('منى علي');
  });

  it('اسم المركز من الإعدادات', () => {
    const html = buildTableHtml({ title: 'ت', columns, rows, settings });
    expect(html).toContain('مركز الأمل التعليمي');
  });

  it('اللون الرئيسي من الإعدادات', () => {
    const html = buildTableHtml({ title: 'ت', columns, rows, settings });
    expect(html).toContain('#4f46e5');
  });

  it('meta و totals و footer', () => {
    const html = buildTableHtml({
      title: 'ت', columns, rows,
      meta: [{ label: 'من', value: '2026-03-01' }],
      totals: [{ label: 'الإجمالي', value: '2000' }],
      footer: 'تم الطباعة بواسطة النظام',
    });
    expect(html).toContain('2026-03-01');
    expect(html).toContain('الإجمالي');
    expect(html).toContain('تم الطباعة بواسطة النظام');
  });

  it('جدول فاضي بيظهر رسالة مش جدول مكسور', () => {
    const html = buildTableHtml({ title: 'ت', columns, rows: [] });
    expect(html).toContain('مفيش بيانات');
    expect(html).not.toContain('أحمد محمد');
  });

  it('بيفصّل المحتوى ضد XSS', () => {
    const evil = [{ name: '<script>alert(1)</script>', amount: 0, date: '' }];
    const html = buildTableHtml({ title: 'ت', columns, rows: evil });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('العنوان نفسه بيتنفّل', () => {
    const html = buildTableHtml({ title: '<img src=x onerror=alert(1)>', columns, rows });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('قيم null/undefined بتظهر «—»', () => {
    const html = buildTableHtml({
      title: 'ت', columns,
      rows: [{ name: null, amount: undefined, date: '' }] as unknown as Record<string, unknown>[],
    });
    expect(html).toContain('—');
  });

  it('أمر الطباعة التلقائي موجود', () => {
    const html = buildTableHtml({ title: 'ت', columns, rows });
    expect(html).toContain('print()');
  });
});

describe('buildReceiptHtml — إيصال الاستلام', () => {
  const base = {
    receiptNo: 'KZ-202603-0042',
    centerName: 'مركز الأمل التعليمي',
    studentName: 'أحمد محمد',
    amount: 800,
    date: '2026-03-10',
  };

  it('HTML فيه رقم الإيصال', () => {
    const html = buildReceiptHtml(base);
    expect(html).toContain('KZ-202603-0042');
    expect(html).toContain('إيصال استلام');
  });

  it('اسم الطالب والمبلغ', () => {
    const html = buildReceiptHtml(base);
    expect(html).toContain('أحمد محمد');
    expect(html).toContain(formatCurrency(800));
  });

  it('طريقة الدفع واسم الموظف', () => {
    const html = buildReceiptHtml({ ...base, method: 'نقدي', collectorName: 'منى' });
    expect(html).toContain('نقدي');
    expect(html).toContain('منى');
  });

  it('المبلغ بالحروف', () => {
    const html = buildReceiptHtml({ ...base, amountInWords: amountToArabicWords(800) });
    expect(html).toContain('ثمانمئة جنيه');
  });

  it('الرصيد قبل وبعد الدفعة', () => {
    const html = buildReceiptHtml({ ...base, remainingBefore: 1600, remainingAfter: 800 });
    expect(html).toContain('المتبقي قبل الدفعة');
    expect(html).toContain('المتبقي بعد الدفعة');
    // الأرقام بتتعرض بالتنسيق العربي (toLocaleString ar-EG)
    expect(html).toContain(formatCurrency(1600));
    expect(html).toContain(formatCurrency(800));
  });

  it('من غير رصيد قبل/بعد الصفوف ما تظهرش', () => {
    const html = buildReceiptHtml(base);
    expect(html).not.toContain('المتبقي قبل الدفعة');
    expect(html).not.toContain('المتبقي بعد الدفعة');
  });

  it('الملاحظات والتذييل', () => {
    const html = buildReceiptHtml({ ...base, notes: 'سداد قسط أول', settings: { ...settings, receiptFooter: 'غير قابل للاسترداد' } });
    expect(html).toContain('سداد قسط أول');
    expect(html).toContain('غير قابل للاسترداد');
  });

  it('الشعار من الإعدادات', () => {
    const html = buildReceiptHtml({ ...base, settings: { ...settings, logo: 'data:image/png;base64,AAA' } });
    expect(html).toContain('data:image/png;base64,AAA');
  });

  it('من غير شعار بيستخدم البديل', () => {
    const html = buildReceiptHtml({ ...base, settings });
    expect(html).toContain('logo-fallback');
  });

  it('رقم إيصال ناقص = «—»', () => {
    const html = buildReceiptHtml({ ...base, receiptNo: undefined });
    expect(html).toContain('—');
  });

  it('بيفصّل المدخلات ضد XSS', () => {
    const html = buildReceiptHtml({ ...base, studentName: '<script>steal()</script>' });
    expect(html).not.toContain('<script>steal()</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('اسم المركز بيتنفّل', () => {
    const html = buildReceiptHtml({ ...base, centerName: '"><b>x</b>' });
    expect(html).not.toContain('"><b>x</b>');
  });

  it('RTL وأمر الطباعة', () => {
    const html = buildReceiptHtml(base);
    expect(html).toContain('direction: rtl');
    expect(html).toContain('print()');
  });

  it('مبلغ صفر ما يكسرش', () => {
    const html = buildReceiptHtml({ ...base, amount: 0 });
    expect(html).toContain('إيصال استلام');
    expect(html).toContain('KZ-202603-0042');
  });
});
