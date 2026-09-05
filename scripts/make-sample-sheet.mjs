/**
 * توليد شيت إكسيل «تجريبي» بأسماء وهمية تماماً.
 *
 * الهدف: نسخة آمنة من شيت المركز تُستخدم في:
 *  - الـ demo والتجربة من غير أي بيانات حقيقية
 *  - الاختبارات (src/test/sheetImport.test.ts)
 *
 * ⚠️ ممنوع رفع شيت المركز الحقيقي على الريبو — فيه أسماء أطفال (بيانات شخصية حساسة).
 *
 * الاستخدام: node scripts/make-sample-sheet.mjs
 */
import * as XLSX from 'xlsx';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../docs/samples/sample-sheet.xlsx');

// أسماء وهمية 100% (مش أسماء طلاب حقيقيين)
const FIRST = ['نور', 'يوسف', 'جنى', 'سيف', 'مليكة', 'آدم', 'ليان', 'كريم', 'فريدة', 'عمر',
  'روميساء', 'زياد', 'حلا', 'ياسين', 'جودي', 'حمزة', 'سلمى', 'مالك', 'ريتاج', 'أنس'];
const LAST = ['تجريبى', 'مثال', 'وهمى', 'نموذج', 'اختبارى', 'توضيحى'];

// مدرسون وهميون (كل تبويب = مدرس)
const TEACHERS = ['مدرس ألف', 'مدرس باء', 'مدرس جيم'];

// عناوين مجموعات بتغطي الحالات الصعبة اللي بيعالجها المحلّل
const GROUP_HEADERS = [
  ['s.r 1  السبت من 4/5', 's.r 2    السبت من5/6', 's.r3    السبت من6/7', 'عمود5'],
  ['level 1 الاحدمن 4/5', 'level 2  الاحد من 5/6', 'حساب  الاثنين والخميس من 6/7', 'Column3'],
  ['قراءة  السب من 4/5', 'إملاء  الثلاث من 5/6', 'مناهج  الاربعاء من 6/7', 'gr 8'],
];

function fakeName(seed) {
  const f = FIRST[seed % FIRST.length];
  const l = LAST[Math.floor(seed / FIRST.length) % LAST.length];
  const n = Math.floor(seed / (FIRST.length * LAST.length)) + 1;
  return n > 1 ? `${f} ${l} ${n}` : `${f} ${l}`;
}

const wb = XLSX.utils.book_new();
let counter = 0;

TEACHERS.forEach((teacher, tIdx) => {
  const headers = GROUP_HEADERS[tIdx];
  const rows = [headers];
  // كل عمود فيه عدد مختلف من الطلاب، والأعمدة الـ placeholder فاضية
  headers.forEach((h, cIdx) => {
    const isPlaceholder = /^(عمود\d+|Column\d+|gr\s*\d+)$/i.test(h.trim());
    const count = isPlaceholder ? 0 : 5 + ((cIdx + tIdx) % 3);
    for (let r = 0; r < count; r++) {
      rows[r + 1] = rows[r + 1] || [];
      rows[r + 1][cIdx] = fakeName(counter++);
    }
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, teacher);
});

// طالب متكرر في مجموعتين لنفس المدرس (لاختبار مسار «نفس الطالب في أكتر من مجموعة»)
{
  const ws = wb.Sheets[TEACHERS[0]];
  const ref = XLSX.utils.decode_range(ws['!ref']);
  const firstStudentCell = XLSX.utils.encode_cell({ r: 1, c: 0 });
  const targetCell = XLSX.utils.encode_cell({ r: ref.e.r + 1, c: 1 });
  ws[targetCell] = { t: 's', v: ws[firstStudentCell].v };
  ref.e.r += 1;
  ws['!ref'] = XLSX.utils.encode_range(ref);
}

// تبويب فاضي (المحلّل بيتخطاه)
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'تبويب فاضى');

mkdirSync(dirname(OUT), { recursive: true });
XLSX.writeFile(wb, OUT);
console.log(`✅ تم توليد الشيت التجريبي: ${OUT}`);
console.log(`   المدرسون: ${TEACHERS.length} · أسماء الطلاب الوهمية: ${counter}`);
