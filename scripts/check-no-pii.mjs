#!/usr/bin/env node
/**
 * فحص منع رفع بيانات شخصية (PII guard)
 *
 * بيفشل لو فيه ملفات بيانات حقيقية متتبعة في git (شيتات/تصدير/نسخ احتياطية)
 * خارج المسارات المسموحة. بيتشغّل في CI ومن pre-commit hook.
 *
 * الاستخدام: node scripts/check-no-pii.mjs
 * الخروج: 0 = سليم · 1 = فيه مشكلة
 */
import { execSync } from 'child_process';

const ALLOWED = [
  /^docs\/samples\//,   // عينات بأسماء وهمية
  /^scripts\//,         // أدوات التوليد
  /^src\/test\/fixtures\//,
];

// امتدادات وأنماط ملفات البيانات
const BLOCKED_EXT = /\.(xlsx|xls|csv|tsv|db|sqlite|sqlite3|sql\.gz|bak)$/i;
const BLOCKED_NAME = /(backup|export|نسخة|شيت|sheet|students|students_data|kids ?zone)/i;

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

const files = trackedFiles();
const violations = [];

for (const f of files) {
  if (ALLOWED.some(re => re.test(f))) continue;
  const isDataExt = BLOCKED_EXT.test(f);
  const isDataName = BLOCKED_NAME.test(f) && /\.(xlsx|xls|csv|json)$/i.test(f);
  if (isDataExt || isDataName) violations.push(f);
}

if (violations.length > 0) {
  console.error('❌ ممنوع رفع ملفات بيانات حقيقية على الريبو:');
  violations.forEach(v => console.error(`   - ${v}`));
  console.error('');
  console.error('   السبب: شيتات المركز فيها أسماء أطفال وبيانات أولياء أمور (بيانات شخصية حساسة).');
  console.error('   الحل:');
  console.error('     1) git rm --cached <file>   (وأضفه في .gitignore)');
  console.error('     2) لو الملف ات رفع قبل كده: bash scripts/purge-pii.sh "<path>"');
  console.error('     3) استخدم نسخة بأسماء وهمية: node scripts/make-sample-sheet.mjs');
  process.exit(1);
}

console.log(`✅ فحص PII سليم (${files.length} ملف متتبَّع، مفيش ملفات بيانات حقيقية).`);
