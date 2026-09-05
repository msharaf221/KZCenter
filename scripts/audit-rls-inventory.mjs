// جرد سياسات RLS لكل الجداول الحقيقية بعد تنفيذ العزل — تأكيد قاطع.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let sql = readFileSync('./supabase_schema.sql', 'utf8');
sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i,
  'CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS $f$ SELECT gen_random_uuid(); $f$ LANGUAGE sql;');
const db = new PGlite();
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$ LANGUAGE sql STABLE;
  DO $d$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $d$;
`);
await db.exec(sql);

// كل جداول public + هل RLS مفعّل + أسماء السياسات
const res = await db.query(`
  SELECT c.relname AS tbl,
         c.relrowsecurity AS rls_enabled,
         COALESCE(string_agg(p.polname, ', ' ORDER BY p.polname), '(لا سياسات = رفض الكل)') AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
  ORDER BY c.relname;
`);

let problems = 0;
console.log('الجدول'.padEnd(26), 'RLS'.padEnd(6), 'السياسات');
console.log('-'.repeat(90));
for (const r of res.rows) {
  const open = /app_sync|app_all/.test(r.policies);
  const hasTenant = /tenant_iso/.test(r.policies);
  const noPolicy = r.policies.includes('رفض الكل');
  let status = '';
  if (r.tbl === 'users') {
    status = noPolicy ? '✅ مقفول بالكامل' : (problems++, '❌ users لازم يتقفل');
  } else {
    // أي جدول تاني: لازم RLS مفعّل + سياسة tenant_iso + مفيش سياسات مفتوحة
    if (!r.rls_enabled) { status = '❌ RLS غير مفعّل'; problems++; }
    else if (open) { status = '❌ فيه سياسة مفتوحة متبقية'; problems++; }
    else if (hasTenant) { status = '✅ معزول'; }
    else if (noPolicy) { status = '⚠️ مقفول (تمام لو مش متزامَن)'; }
  }
  console.log(r.tbl.padEnd(26), String(r.rls_enabled ? 'on' : 'off').padEnd(6), r.policies, '  →', status);
}
console.log('\n' + (problems === 0 ? '✅ الجرد نظيف: لا جداول مفتوحة، لا سياسات قديمة متبقية.'
                                : `❌ عدد المشاكل: ${problems}`));
process.exit(problems ? 1 : 0);
