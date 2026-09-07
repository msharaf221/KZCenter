/**
 * اختبارات قراءة الداتا الجدولية — src/lib/tableImport.ts
 *
 * الهدف: أي شكل داتا المستخدم يرفعه (Excel / CSV / JSON، بأسماء أعمدة عربي أو
 * إنجليزي، بترتيب مختلف، بأعمدة ناقصة) لازم يتقرا صح ويطلّع سجلات مترابطة.
 */
import { describe, it, expect } from 'vitest';
import { buildXlsxBuffer } from './helpers/excel';
import {
  detectField, mapHeaders, looksLikeTable, parseRow, parseTable,
  parseNumber, parseGender, rowsFromCsv, rowsFromJson, rowsFromExcel, parseAnyTable,
} from '../lib/tableImport';

describe('detectField — التعرف على أعمدة الجدول', () => {
  it('بيعرف أعمدة الطالب بالعربي والإنجليزي', () => {
    expect(detectField('اسم الطالب')).toBe('studentName');
    expect(detectField('الطالب')).toBe('studentName');
    expect(detectField('Student Name')).toBe('studentName');
    expect(detectField('name')).toBe('studentName');
  });

  it('بيفرّق بين تليفون الطالب وتليفون ولي الأمر', () => {
    expect(detectField('تليفون الطالب')).toBe('studentPhone');
    expect(detectField('رقم ولي الامر')).toBe('parentPhone');
    expect(detectField('تليفون ولي الأمر')).toBe('parentPhone');
  });

  it('بيفرّق بين اسم الطالب واسم المدرس', () => {
    expect(detectField('اسم المدرس')).toBe('teacherName');
    expect(detectField('المدرس')).toBe('teacherName');
    expect(detectField('Teacher')).toBe('teacherName');
  });

  it('بيعرف المجموعة والمادة والسعر', () => {
    expect(detectField('المجموعة')).toBe('groupName');
    expect(detectField('الجروب')).toBe('groupName');
    expect(detectField('المادة')).toBe('subject');
    expect(detectField('السعر')).toBe('price');
    expect(detectField('الاشتراك')).toBe('price');
    expect(detectField('Fees')).toBe('price');
  });

  it('بيتحمّل الهمزات والتشكيل والرموز', () => {
    expect(detectField('  اسم الطالب  ')).toBe('studentName');
    expect(detectField('الماده')).toBe('subject');
    expect(detectField('اسم المجموعه')).toBe('groupName');
  });

  it('بيرجّع null للأعمدة المش معروفة', () => {
    expect(detectField('حاجة تانية خالص')).toBeNull();
    expect(detectField('')).toBeNull();
  });
});

describe('mapHeaders / looksLikeTable', () => {
  it('بيبني خريطة الأعمدة بالترتيب الصحيح', () => {
    const map = mapHeaders(['اسم الطالب', 'المدرس', 'المجموعة', 'السعر']);
    expect(map).toEqual({ studentName: 0, teacherName: 1, groupName: 2, price: 3 });
  });

  it('بيتجاهل العمود المكرر (الأول بيكسب)', () => {
    const map = mapHeaders(['الاسم', 'اسم الطالب']);
    expect(map.studentName).toBe(0);
  });

  it('الجدول لازم يكون فيه اسم طالب + عمود ربط', () => {
    expect(looksLikeTable(['اسم الطالب', 'المدرس'])).toBe(true);
    expect(looksLikeTable(['اسم الطالب', 'المادة'])).toBe(true);
    expect(looksLikeTable(['اسم الطالب', 'السن'])).toBe(false);   // مفيش ربط
    expect(looksLikeTable(['المدرس', 'المجموعة'])).toBe(false);   // مفيش طالب
  });
});

describe('parseNumber / parseGender', () => {
  it('بيقرا الأرقام مع العملة والفواصل', () => {
    expect(parseNumber('250')).toBe(250);
    expect(parseNumber('250 ج.م')).toBe(250);
    expect(parseNumber('1,200')).toBe(1200);
    expect(parseNumber('  200.5 ')).toBe(200.5);
    expect(parseNumber('مفيش')).toBeUndefined();
    expect(parseNumber('')).toBeUndefined();
  });

  it('بيقرا النوع بالعربي والإنجليزي', () => {
    expect(parseGender('ولد')).toBe('male');
    expect(parseGender('ذكر')).toBe('male');
    expect(parseGender('Male')).toBe('male');
    expect(parseGender('بنت')).toBe('female');
    expect(parseGender('أنثى')).toBe('female');
    expect(parseGender('Female')).toBe('female');
    expect(parseGender('')).toBeUndefined();
  });
});

describe('parseRow — قراءة الصف', () => {
  const headers = ['اسم الطالب', 'تليفون', 'المدرس', 'المجموعة', 'المادة', 'السعر'];
  const map = mapHeaders(headers);

  it('بيقرا الصف الكامل ويطلّع المادة', () => {
    const r = parseRow(['أحمد محمد', '01012345678', 'ولاء', 'ماث 1 السبت من 4/5', 'ماث', '250'], map, 2)!;
    expect(r.studentName).toBe('أحمد محمد');
    expect(r.studentPhone).toBe('01012345678');
    expect(r.teacherName).toBe('ولاء');
    expect(r.subject?.id).toBe('math');
    expect(r.price).toBe(250);
    expect(r.days).toEqual(['saturday']);
    expect(r.startTime).toBe('16:00');
  });

  it('بيستخرج التليفون من نفس خلية الاسم', () => {
    const r = parseRow(['سارة علي 01098765432', '', 'هاجر', 'قرآن', '', ''], map, 3)!;
    expect(r.studentName).toBe('سارة علي');
    expect(r.studentPhone).toBe('01098765432');
  });

  it('بيعرف المادة من اسم المجموعة لو عمود المادة فاضي', () => {
    const r = parseRow(['محمود', '', 'ولاء', 'تحفيظ 2', '', ''], map, 4)!;
    expect(r.subject?.id).toBe('quran');
  });

  it('بيرجّع null للصف من غير اسم طالب', () => {
    expect(parseRow(['', '', 'ولاء', 'ماث', '', ''], map, 5)).toBeNull();
    expect(parseRow([], map, 6)).toBeNull();
  });
});

describe('rowsFromCsv', () => {
  it('بيقرا CSV عادي', () => {
    const { headers, rows } = rowsFromCsv('اسم الطالب,المدرس,المادة\nأحمد,ولاء,ماث\nسارة,هاجر,قرآن');
    expect(headers).toEqual(['اسم الطالب', 'المدرس', 'المادة']);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['سارة', 'هاجر', 'قرآن']);
  });

  it('بيتعامل مع علامات التنصيص والفواصل جوه الخلية', () => {
    const { rows } = rowsFromCsv('name,note\n"أحمد, محمد","ملاحظة ""مهمة"""');
    expect(rows[0]).toEqual(['أحمد, محمد', 'ملاحظة "مهمة"']);
  });

  it('بيكتشف الفاصل المنقوط والتاب', () => {
    expect(rowsFromCsv('a;b;c\n1;2;3').rows[0]).toEqual(['1', '2', '3']);
    expect(rowsFromCsv('a\tb\n1\t2').rows[0]).toEqual(['1', '2']);
  });

  it('بيشيل الـ BOM ويتجاهل الصفوف الفاضية', () => {
    const { headers, rows } = rowsFromCsv('\uFEFFname,x\n\nأحمد,1\n\n');
    expect(headers[0]).toBe('name');
    expect(rows).toHaveLength(1);
  });
});

describe('rowsFromJson', () => {
  it('بيقرا مصفوفة كائنات', () => {
    const { headers, rows } = rowsFromJson([
      { 'اسم الطالب': 'أحمد', 'المدرس': 'ولاء' },
      { 'اسم الطالب': 'سارة', 'المدرس': 'هاجر' },
    ]);
    expect(headers).toEqual(['اسم الطالب', 'المدرس']);
    expect(rows).toEqual([['أحمد', 'ولاء'], ['سارة', 'هاجر']]);
  });

  it('بيلاقي المصفوفة جوه كائن', () => {
    expect(rowsFromJson({ students: [{ name: 'أحمد' }] }).rows).toEqual([['أحمد']]);
    expect(rowsFromJson({ data: [{ name: 'سارة' }] }).rows).toEqual([['سارة']]);
  });

  it('بيتعامل مع عناصر مفاتيحها مختلفة', () => {
    const { headers, rows } = rowsFromJson([{ a: 1 }, { b: 2 }]);
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([['1', ''], ['', '2']]);
  });

  it('بيرجّع فاضي للمدخلات الغلط', () => {
    expect(rowsFromJson([]).rows).toEqual([]);
    expect(rowsFromJson(null).rows).toEqual([]);
  });
});

describe('parseTable — النتيجة المجمّعة', () => {
  it('بيجمّع المدرسين والمجموعات والمواد', () => {
    const result = parseTable(
      ['اسم الطالب', 'المدرس', 'المجموعة', 'المادة', 'السعر'],
      [
        ['أحمد', 'ولاء', 'ماث 1', 'ماث', '250'],
        ['سارة', 'ولاء', 'ماث 1', 'ماث', '250'],
        ['محمود', 'هاجر', 'قرآن 1', 'قرآن', '200'],
      ],
    );
    expect(result.records).toHaveLength(3);
    expect(result.teachers).toEqual(['ولاء', 'هاجر']);
    expect(result.groups).toEqual(['ماث 1', 'قرآن 1']);
    expect(result.subjects.sort()).toEqual(['قرآن', 'ماث (Math)'].sort());
    expect(result.uniqueStudents).toBe(3);
    expect(result.looksLikeTable).toBe(true);
  });

  it('بيحسب الصفوف المتخطّاة ويحذّر من الأعمدة الناقصة', () => {
    const result = parseTable(
      ['اسم الطالب', 'المادة'],
      [['أحمد', 'ماث'], ['', 'قرآن'], ['سارة', '']],
    );
    expect(result.records).toHaveLength(2);
    expect(result.skippedRows).toBe(1);
    expect(result.warnings.some(w => w.includes('مدرس'))).toBe(true);
    expect(result.warnings.some(w => w.includes('مادته'))).toBe(true);
  });

  it('بيسجّل الأعمدة المش معروفة من غير ما يكسر', () => {
    const result = parseTable(
      ['اسم الطالب', 'المدرس', 'حاجة غريبة'],
      [['أحمد', 'ولاء', 'قيمة']],
    );
    expect(result.unknownHeaders).toEqual(['حاجة غريبة']);
    expect(result.records).toHaveLength(1);
  });
});

describe('parseAnyTable — كل الصيغ', () => {
  it('بيقرا JSON', async () => {
    const json = JSON.stringify([
      { 'اسم الطالب': 'أحمد', 'المدرس': 'ولاء', 'المادة': 'ماث', 'السعر': 250 },
    ]);
    const result = await parseAnyTable({
      name: 'data.json',
      buffer: new TextEncoder().encode(json).buffer as ArrayBuffer,
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0].subject?.id).toBe('math');
    expect(result.records[0].price).toBe(250);
  });

  it('بيقرا CSV', async () => {
    const csv = 'اسم الطالب,المدرس,المادة\nسارة,هاجر,قرآن';
    const result = await parseAnyTable({
      name: 'data.csv',
      buffer: new TextEncoder().encode(csv).buffer as ArrayBuffer,
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0].subject?.id).toBe('quran');
  });

  it('بيقرا Excel وبيلاقي صف العناوين حتى لو مش أول صف', async () => {
    const bytes = await buildXlsxBuffer([{
      name: 'الطلاب',
      rows: [
        ['كشف طلاب المركز'],          // سطر عنوان
        ['اسم الطالب', 'المدرس', 'المادة', 'السعر'],
        ['أحمد', 'ولاء', 'إنجليزي', '250'],
        ['سارة', 'هاجر', 'حساب', '200'],
      ],
    }]);
    const result = await parseAnyTable({
      name: 'data.xlsx',
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
    expect(result.records).toHaveLength(2);
    expect(result.records[0].subject?.id).toBe('english');
    expect(result.records[1].subject?.id).toBe('hesab');
  });

  it('بيدمج تبويبات Excel المتعددة', async () => {
    const bytes = await buildXlsxBuffer([
      { name: 'ماث', rows: [['اسم الطالب', 'المدرس', 'المادة'], ['أحمد', 'ولاء', 'ماث']] },
      { name: 'قرآن', rows: [['اسم الطالب', 'المدرس', 'المادة'], ['سارة', 'هاجر', 'قرآن']] },
    ]);
    const result = await parseAnyTable({
      name: 'data.xlsx',
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    });
    expect(result.records).toHaveLength(2);
    expect(result.teachers.sort()).toEqual(['هاجر', 'ولاء'].sort());
  });

  it('rowsFromExcel بيتخطى التبويبات الفاضية', async () => {
    const bytes = await buildXlsxBuffer([
      { name: 'فاضي', rows: [] },
      { name: 'بيانات', rows: [['اسم الطالب', 'المدرس'], ['أحمد', 'ولاء']] },
    ]);
    const sheets = await rowsFromExcel(bytes);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheetName).toBe('بيانات');
  });
});
