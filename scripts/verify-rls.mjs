// تحقق فعلي من عزل المستأجرين (RLS) باستخدام Postgres حقيقي (pglite WASM).
// نحاكي بيئة Supabase: نظام auth.uid()، وأدوار anon / authenticated.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

let sql = readFileSync('./supabase_schema.sql', 'utf8');
// pglite لا يحزم امتداد uuid-ossp (Supabase يوفّره). نستبدله بـ gen_random_uuid المدمج.
sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i,
  'CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS $f$ SELECT gen_random_uuid(); $f$ LANGUAGE sql;');
const db = new PGlite();

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const OWNER = '33333333-3333-3333-3333-333333333333';

await db.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$ LANGUAGE sql STABLE;
  DO $d$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $d$;
`);

await db.exec(sql);
// Supabase يمنح هذه الصلاحيات تلقائياً للأدوار؛ نحاكيها بعد إنشاء الجداول.
await db.exec(`
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  INSERT INTO auth.users (id) VALUES ('${A}'), ('${B}'), ('${OWNER}');
`);
const ownerMigration = readFileSync('./docs/migrations/20261018_owner_mobile_realtime.sql', 'utf8');
await db.exec(ownerMigration);
await db.exec(`INSERT INTO public.center_memberships (user_id, tenant_id, role) VALUES ('${OWNER}', '${A}', 'owner');`);
console.log('✔ schema + ترحيل المالك وRealtime تم تنفيذهما بالكامل بدون أخطاء');

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✅', name)) : (fail++, console.log('  ❌', name)); };

// تنفيذ دالة داخل معاملة بدور/مستخدم معيّن. كل استعلام داخل savepoint
// حتى لا تُجهض المعاملة كلها عند رفض RLS.
async function asUser(role, sub, fn) {
  await db.query('BEGIN');
  await db.query(`SET LOCAL ROLE ${role}`);
  if (sub) await db.query(`SET LOCAL request.jwt.claim.sub = '${sub}'`);
  try {
    return await fn(async (q, p) => {
      await db.query('SAVEPOINT sp');
      try {
        const r = await db.query(q, p);
        await db.query('RELEASE SAVEPOINT sp');
        return { ok: true, rows: r.rows, affected: r.affectedRows ?? r.rowCount ?? 0 };
      } catch (e) {
        await db.query('ROLLBACK TO SAVEPOINT sp');
        return { ok: false, error: e, rows: [], affected: 0 };
      }
    });
  } finally {
    await db.query('ROLLBACK');
  }
}
// إدخالات ثابتة تُعمل commit
async function seed(role, sub, stmts) {
  await db.query('BEGIN');
  await db.query(`SET LOCAL ROLE ${role}`);
  await db.query(`SET LOCAL request.jwt.claim.sub = '${sub}'`);
  for (const s of stmts) await db.query(s);
  await db.query('COMMIT');
}

console.log('\n[1] anon بدون جلسة = مرفوض تماماً');
await asUser('anon', null, async (q) => {
  const ins = await q("INSERT INTO students (id, name, age, gender, parent_phone) VALUES ('x','s',9,'male','010')");
  ok('anon ممنوع من الإدراج', ins.ok === false);
  const sel = await q('SELECT count(*)::int AS c FROM students');
  ok('anon لا يرى أي صفوف', sel.ok && sel.rows[0].c === 0);
});

console.log('\n[2] المستأجر A يدرس صفوفاً — tenant_id يُضبط تلقائياً');
await seed('authenticated', A, [
  "INSERT INTO students (id, name, age, gender, parent_phone) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','طالب A1',10,'male','010'), ('aaaaaaaa-0000-0000-0000-000000000002','طالب A2',11,'female','011')",
  "INSERT INTO settings (id, center_name) VALUES ('main','مركز A')",
]);
await asUser('authenticated', A, async (q) => {
  const r = await q('SELECT tenant_id::text AS t, name FROM students ORDER BY name');
  ok('كل صفوف A موسومة بـ tenant_id = A', r.ok && r.rows.every(x => x.t === A));
  const s = await q("SELECT tenant_id::text AS t, center_name FROM settings WHERE id='main'");
  ok('settings A موسومة بـ A', s.ok && s.rows.length === 1 && s.rows[0].t === A);
  const mine = await q('SELECT count(*)::int AS c FROM students');
  ok('A يرى صفّيه', mine.ok && mine.rows[0].c === 2);
});

console.log('\n[3] المستأجر B معزول — لا يرى ولا يلمس بيانات A');
await asUser('authenticated', B, async (q) => {
  const r = await q('SELECT count(*)::int AS c FROM students');
  ok('B لا يرى صفوف A', r.ok && r.rows[0].c === 0);
  const s = await q("SELECT count(*)::int AS c FROM settings WHERE id='main'");
  ok('B لا يرى settings الخاصة بـ A', s.ok && s.rows[0].c === 0);
  const upd = await q("UPDATE students SET name='مخترق' WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  ok('B: تعديل صف A يؤثر على 0 صفوف', upd.ok === true && upd.affected === 0);
  const del = await q("DELETE FROM students WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  ok('B: حذف صف A يؤثر على 0 صفوف', del.ok === true && del.affected === 0);
});
// التأكد أن بيانات A سليمة
await asUser('authenticated', A, async (q) => {
  const r = await q("SELECT name FROM students WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  ok('صف A لم يتغير بعد محاولات B', r.ok && r.rows[0].name === 'طالب A1');
});

console.log('\n[4] محاولة تزوير tenant_id من العميل لا تنطلي');
await asUser('authenticated', B, async (q) => {
  const ins = await q("INSERT INTO students (id, name, age, gender, parent_phone, tenant_id) VALUES ('aaaaaaaa-0000-0000-0000-0000000000f1','تزوير',9,'male','012',$1)", [A]);
  const r = await q("SELECT tenant_id::text AS t FROM students WHERE id='aaaaaaaa-0000-0000-0000-0000000000f1'");
  ok('الـ trigger يجبر tenant_id = B حتى لو أرسل العميل A', ins.ok && r.ok && r.rows[0]?.t === B);
});

console.log('\n[5] settings لكل مركز صف مستقل (مفتاح مركّب id,tenant_id)');
await seed('authenticated', B, ["INSERT INTO settings (id, center_name) VALUES ('main','مركز B')"]);
await asUser('authenticated', B, async (q) => {
  const r = await q("SELECT center_name FROM settings WHERE id='main'");
  ok('B يرى settings الخاصة به فقط', r.ok && r.rows.length === 1 && r.rows[0].center_name === 'مركز B');
});
await asUser('authenticated', A, async (q) => {
  const r = await q("SELECT center_name FROM settings WHERE id='main'");
  ok('A يرى settings الخاصة به فقط', r.ok && r.rows.length === 1 && r.rows[0].center_name === 'مركز A');
});

console.log('\n[6] نقل صف لمستأجر آخر عند التعديل ممنوع');
await asUser('authenticated', A, async (q) => {
  await q('UPDATE students SET tenant_id=$1 WHERE id=$2', [B, 'aaaaaaaa-0000-0000-0000-000000000001']);
  const r = await q("SELECT tenant_id::text AS t FROM students WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  ok('tenant_id يبقى = A بعد محاولة تغييره إلى B', r.ok && r.rows[0].t === A);
});

await seed('authenticated', B, [
  "INSERT INTO students (id, name, age, gender, parent_phone) VALUES ('bbbbbbbb-0000-0000-0000-000000000001','طالب B1',12,'male','013')",
]);
await seed('authenticated', A, [
  "UPDATE students SET created_at='2026-10-18 10:00:00+00' WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002')",
  "INSERT INTO payments (id, student_id, amount, type, status, date, method, collected_by, collected_by_name, created_at) VALUES ('aaaaaaaa-0000-0000-0000-000000000101','aaaaaaaa-0000-0000-0000-000000000001',120,'subscription','paid','2026-10-18','cash','sec-1','ندى','2026-10-18 10:05:00+00'), ('aaaaaaaa-0000-0000-0000-000000000102','aaaaaaaa-0000-0000-0000-000000000002',80,'books','paid','2026-10-18','instapay','sec-2','سارة','2026-10-18 10:06:00+00'), ('aaaaaaaa-0000-0000-0000-000000000103','aaaaaaaa-0000-0000-0000-000000000002',999,'other','pending','2026-10-18','cash',NULL,NULL,'2026-10-18 10:07:00+00'), ('aaaaaaaa-0000-0000-0000-000000000104','aaaaaaaa-0000-0000-0000-000000000002',333,'other','paid','2026-10-18','cash',NULL,NULL,'2026-10-18 10:08:00+00'), ('aaaaaaaa-0000-0000-0000-000000000105','aaaaaaaa-0000-0000-0000-000000000002',444,'other','paid','2026-10-18','cash',NULL,NULL,'2026-10-18 10:09:00+00')",
  "UPDATE payments SET voided=TRUE WHERE id='aaaaaaaa-0000-0000-0000-000000000104'",
  "UPDATE payments SET deleted=TRUE WHERE id='aaaaaaaa-0000-0000-0000-000000000105'",
  "INSERT INTO refunds (id, student_id, amount, reason, method, date, username) VALUES ('refund-a1','aaaaaaaa-0000-0000-0000-000000000001',30,'تجريبي','cash','2026-10-18','admin'), ('refund-a2','aaaaaaaa-0000-0000-0000-000000000002',100,'محذوف','cash','2026-10-18','admin')",
  "UPDATE refunds SET deleted=TRUE WHERE id='refund-a2'",
  "INSERT INTO expenses (category, amount, description, date) VALUES ('other',50,'مصروف اختبار','2026-10-18'), ('other',99,'مصروف محذوف','2026-10-18')",
  "UPDATE expenses SET deleted=TRUE WHERE description='مصروف محذوف'",
  "INSERT INTO attendance (id, student_id, date, status) VALUES ('aaaaaaaa-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000001','2026-10-18','present'), ('aaaaaaaa-0000-0000-0000-000000000202','aaaaaaaa-0000-0000-0000-000000000002','2026-10-18','absent')",
]);
console.log('\n[7] حساب المالك: قراءة مركزه فقط ومنع أي تعديل');
await asUser('authenticated', OWNER, async q => {
  const context = await q('SELECT tenant_id::text AS tenant, role FROM public.get_my_center_context()');
  const own = await q("SELECT count(*)::int AS c FROM students WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  const other = await q("SELECT count(*)::int AS c FROM students WHERE id='bbbbbbbb-0000-0000-0000-000000000001'");
  const update = await q("UPDATE students SET name='تعديل من المالك' WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  const remove = await q("DELETE FROM students WHERE id='aaaaaaaa-0000-0000-0000-000000000001'");
  const insert = await q("INSERT INTO students (id, name, age, gender, parent_phone) VALUES ('cccccccc-0000-0000-0000-000000000001','كتابة ممنوعة',10,'female','014')");
  const paymentInsert = await q("INSERT INTO payments (id, amount, type, status, date) VALUES ('cccccccc-0000-0000-0000-000000000002',50,'other','paid','2026-10-18')");
  const summary = await q("SELECT public.get_owner_mobile_snapshot($1::date, $2::timestamptz, $3::timestamptz) AS snapshot", ['2026-10-18', '2026-10-18 00:00:00+00', '2026-10-19 00:00:00+00']);
  const memberships = await q('SELECT count(*)::int AS c FROM center_memberships');
  const snapshotData = summary.rows[0]?.snapshot;
  const collectors = snapshotData?.by_collector;
  ok('المالك مربوط بالمركز الصحيح ودوره owner', context.ok && context.rows[0]?.tenant === A && context.rows[0]?.role === 'owner');
  ok('المالك يرى بيانات مركزه', own.ok && own.rows[0]?.c === 1);
  ok('المالك لا يرى بيانات مركز آخر', other.ok && other.rows[0]?.c === 0);
  ok('المالك لا يستطيع تعديل صفوف مركزه', update.ok && update.affected === 0);
  ok('المالك لا يستطيع حذف صفوف مركزه', remove.ok && remove.affected === 0);
  ok('المالك ممنوع من إنشاء سجلات مالية/أكاديمية', insert.ok === false && paymentInsert.ok === false);
  ok('المالك يرى عضويته فقط', memberships.ok && memberships.rows[0]?.c === 1);
  ok('ملخص المالك يجمع الدفعات المسددة فقط ويستبعد المعلّق والملغى والمحذوف', summary.ok && Number(snapshotData?.collected) === 200 && Number(snapshotData?.payment_count) === 2);
  ok('الملخص يحسب صافي الحركة بدقة داخل PostgreSQL', Number(snapshotData?.refunds) === 30 && Number(snapshotData?.expenses) === 50 && Number(snapshotData?.net) === 120);
  ok('الملخص يعيد الحضور والغياب والطلاب الجدد للمركز المرتبط فقط', Number(snapshotData?.attendance_count) === 2 && Number(snapshotData?.absent_count) === 1 && Number(snapshotData?.new_students) === 2);
  ok('تفصيل التحصيل حسب الطريقة محفوظ في الاستجابة', Number(snapshotData?.by_method?.cash) === 120 && Number(snapshotData?.by_method?.instapay) === 80);
  ok('التحصيل اليومي مفصل حسب الموظف وقيمته دقيقة', Array.isArray(collectors) && collectors.length === 2 && Number(collectors.find(item => item.id === 'sec-1')?.amount) === 120 && Number(collectors.find(item => item.id === 'sec-2')?.amount) === 80);
});
await asUser('authenticated', A, async q => {
  const summary = await q("SELECT public.get_owner_mobile_snapshot('2026-10-18', '2026-10-18 00:00:00+00', '2026-10-19 00:00:00+00') AS snapshot");
  ok('حساب مزامنة المركز لا يمكنه استدعاء ملخص المالك', summary.ok === false);
});

// ترحيل المرتبات مستقل وقابل لإعادة التنفيذ، ولا يغيّر سياسات RLS.
console.log('\n[8] أعمدة المرتبات ونسب المدرسين وسندات الصرف');
const payrollMigration = readFileSync('./docs/migrations/20260924_teacher_payroll.sql', 'utf8');
await db.exec(payrollMigration);
await db.exec(payrollMigration);
ok('ترحيل المرتبات قابل لإعادة التنفيذ', true);
await seed('authenticated', A, [
  "INSERT INTO teachers (id, name, specialization, phone, pay_model, pay_rate, pay_notes) VALUES ('aaaaaaaa-0000-0000-0000-000000000010', 'مدرس تجريبي', 'رياضيات', '010', 'subscription_percentage', 60, 'نسبة الاشتراك')",
  `INSERT INTO payroll (id, teacher_id, teacher_name, period, model, rate, base, gross, net, paid_amount, status, lines)
    VALUES ('payroll-test', 'aaaaaaaa-0000-0000-0000-000000000010', 'مدرس تجريبي', '2026-09', 'subscription_percentage', 60, 200, 120, 120, 50, 'partial',
      '[{"groupId":"g1","amount":120,"students":[{"studentId":"s1","subscriptionAmount":200,"rate":60,"amount":120}]}]'::jsonb)`,
  "INSERT INTO expenses (category, amount, description, date, teacher_id, payroll_id, user_id, username, method) VALUES ('salaries', 50, 'صرف جزئي', '2026-09-24', 'aaaaaaaa-0000-0000-0000-000000000010', 'payroll-test', 'admin-test', 'admin', 'cash')",
]);
await asUser('authenticated', A, async (q) => {
  const teacher = await q("SELECT pay_model, pay_rate FROM teachers WHERE id='aaaaaaaa-0000-0000-0000-000000000010'");
  ok('نسبة المدرس محفوظة في السحابة', teacher.ok && Number(teacher.rows[0]?.pay_rate) === 60 && teacher.rows[0]?.pay_model === 'subscription_percentage');
  const record = await q("SELECT rate, lines, tenant_id::text AS tenant FROM payroll WHERE id='payroll-test'");
  ok('الكشف يحفظ النسبة وتفصيل الطلاب داخل مركزه', record.ok && record.rows[0]?.tenant === A && Number(record.rows[0]?.rate) === 60 && record.rows[0]?.lines[0].students[0].amount === 120);
  const expense = await q("SELECT amount, method FROM expenses WHERE payroll_id='payroll-test'");
  ok('سند الصرف مرتبط بالكشف', expense.ok && Number(expense.rows[0]?.amount) === 50 && expense.rows[0]?.method === 'cash');
});
await asUser('authenticated', B, async (q) => {
  const record = await q("SELECT count(*)::int AS c FROM payroll WHERE id='payroll-test'");
  const expense = await q("SELECT count(*)::int AS c FROM expenses WHERE payroll_id='payroll-test'");
  ok('مركز آخر لا يرى كشف الراتب أو سند صرفه', record.ok && expense.ok && record.rows[0].c === 0 && expense.rows[0].c === 0);
});

console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
