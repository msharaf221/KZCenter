import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let sql = readFileSync('./supabase_schema.sql','utf8');
sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i,
 'CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS $f$ SELECT gen_random_uuid(); $f$ LANGUAGE sql;');
const db = new PGlite();
await db.exec(`CREATE SCHEMA IF NOT EXISTS auth;
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true),'')::uuid; $$ LANGUAGE sql STABLE;
 DO $d$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 END $d$;`);
await db.exec(sql);
await db.exec(`GRANT USAGE ON SCHEMA public TO authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;`);
const A='11111111-1111-1111-1111-111111111111', B='22222222-2222-2222-2222-222222222222';
let pass=0, fail=0; const ok=(n,c)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n));};
async function run(role,sub,fn){ await db.query('BEGIN'); await db.query(`SET LOCAL ROLE ${role}`);
  if(sub) await db.query(`SET LOCAL request.jwt.claim.sub='${sub}'`);
  try{ return await fn(async(q,p)=>{ await db.query('SAVEPOINT s');
    try{const r=await db.query(q,p); await db.query('RELEASE SAVEPOINT s'); return{ok:true,rows:r.rows,affected:r.affectedRows??0};}
    catch(e){await db.query('ROLLBACK TO SAVEPOINT s'); return{ok:false,error:e,rows:[],affected:0};}});}
  finally{ await db.query('ROLLBACK'); } }
async function seed(role,sub,stmts){ await db.query('BEGIN'); await db.query(`SET LOCAL ROLE ${role}`);
  await db.query(`SET LOCAL request.jwt.claim.sub='${sub}'`); for(const s of stmts) await db.query(s); await db.query('COMMIT'); }

console.log('[1] upsert مرتَين لنفس id (محاكاة رفعتين) — المركّب يحدّث وما يضربش');
await seed('authenticated', A, [
  `INSERT INTO counters (id, value, updated_at) VALUES ('receipts', 5, NOW())
   ON CONFLICT (id, tenant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
]);
await seed('authenticated', A, [
  `INSERT INTO counters (id, value, updated_at) VALUES ('receipts', 9, NOW())
   ON CONFLICT (id, tenant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
]);
await run('authenticated', A, async q=>{ const r=await q("SELECT value FROM counters WHERE id='receipts'");
  ok('counters value = 9 (تحديث upsert مركّب شغّال)', r.ok && r.rows[0].value===9); });

console.log('[2] نفس id counters لمركزين = صفّان مستقلان');
await seed('authenticated', B, [
  `INSERT INTO counters (id, value, updated_at) VALUES ('receipts', 2, NOW())
   ON CONFLICT (id, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
]);
await run('authenticated', B, async q=>{ const r=await q("SELECT value FROM counters WHERE id='receipts'");
  ok('B يرى value=2 بتاعه مش 9 بتاع A', r.ok && r.rows[0].value===2); });
await run('authenticated', A, async q=>{ const r=await q("SELECT count(*)::int c FROM counters");
  ok('A يرى صف counters واحد (معزول عن B)', r.ok && r.rows[0].c===1); });

console.log('[3] payroll: عزل + upsert');
await seed('authenticated', A, [
  `INSERT INTO payroll (id, teacher_id, teacher_name, period, net) VALUES ('p1','t1','مدرس A','2026-09',1000)`,
]);
await run('authenticated', B, async q=>{ const r=await q('SELECT count(*)::int c FROM payroll');
  ok('B مش شايف payroll بتاع A', r.ok && r.rows[0].c===0); });
// قراءة في transaction مخصصة (rollback) من بيانات ملتزم بها
async function readAs(role, sub, sql, params){ return run(role, sub, q => q(sql, params)); }
const pa = await readAs('authenticated', A, "SELECT tenant_id::text t, net FROM payroll WHERE id='p1'");
ok('payroll A موسوم بـ A و net محفوظ', pa.ok && pa.rows[0] && pa.rows[0].t===A && Number(pa.rows[0].net)===1000);

console.log('[4] anon مرفوض على الجداول الجديدة');
// أولاً نقرأ في معاملة نظيفة (القراءة مع RLS لـ anon = 0 صفوف من غير خطأ)
const anonRead = await readAs('anon', null, 'SELECT count(*)::int c FROM refunds');
// anon بلا سياسة: إما الخطأ permission denied أو 0 صفوف — الاتنين رفض وآمن
ok('anon لا يرى refunds (مرفوض = 0 صفوف أو خطأ صلاحية)',
   (!anonRead.ok) || (anonRead.rows[0] && anonRead.rows[0].c===0));
// بعدين محاولة الكتابة في معاملة منفصلة
await run('anon', null, async q=>{ const w=await q("INSERT INTO waitlist (id, group_id, student_id) VALUES ('w1','g1','s1')");
  ok('anon ممنوع من الكتابة في waitlist', w.ok===false); });

console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail?1:0);
