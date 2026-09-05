import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let sql = readFileSync('./supabase_schema.sql','utf8').replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i,
 'CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS $f$ SELECT gen_random_uuid(); $f$ LANGUAGE sql;');
const db = new PGlite();
await db.exec(`CREATE SCHEMA IF NOT EXISTS auth;
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid; $$ LANGUAGE sql STABLE;
 DO $d$ BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 END $d$;`);
await db.exec(sql);

const COMPOSITE = ['settings','counters','payroll','teacher_advances','refunds',
  'cashbox_sessions','message_templates','message_logs','waitlist','audit_logs'];
const CLOUD_TABLES = ['students','teachers','courses','groups','payments','attendance',
  'expenses','exams','grades','enrollments','installments','refunds','inventory',
  'inventory_transactions','payroll','teacher_advances','cashbox_sessions',
  'message_templates','message_logs','waitlist','audit_logs','counters','settings'];

// كل فهرس فريد على حدة (صف لكل فهرس، بدون دمج أعمدة فهارس مختلفة)
const q = await db.query(`
  SELECT t.relname AS tbl, ix.indkey AS indkey, ix.indpred IS NOT NULL AS partial
  FROM pg_index ix
  JOIN pg_class t ON t.oid=ix.indrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND ix.indisunique;
`);
// خريطة attnum -> اسم العمود لكل جدول
const attrQ = await db.query(`
  SELECT c.relname AS tbl, a.attnum AS num, a.attname AS col
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND a.attnum>0;
`);
const attr = {};
for (const r of attrQ.rows) (attr[r.tbl] ||= {})[r.num] = r.col;
const uniques = {};
for (const r of q.rows) {
  const map = attr[r.tbl] || {};
  const cols = String(r.indkey).trim().split(/\s+/).map(k => map[Number(k)]).join(',');
  (uniques[r.tbl] ||= []).push({ cols, partial: r.partial });
}

let pass=0, fail=0;
const ok=(n,c)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n));};
for (const t of CLOUD_TABLES) {
  const exists = !!(await db.query(`SELECT to_regclass('public.${t}')::text x`)).rows[0].x;
  if (!exists) { fail++; console.log('  ❌', t, '→ الجدول غير موجود'); continue; }
  const want = (COMPOSITE.includes(t) ? ['id','tenant_id'] : ['id']).join(',');
  // لازم يوجد فهرس فريد غير جزئي على الأعمدة المطلوبة بالضبط
  const list = uniques[t] || [];
  const found = list.some(u => !u.partial && u.cols === want);
  ok(`${t.padEnd(24)} onConflict=(${want})`, found);
}
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail?1:0);
