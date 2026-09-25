-- مرتبات المدرسين: شغّل مرة واحدة في Supabase SQL Editor للمشروعات القائمة.
-- آمن لإعادة التنفيذ، ولا يغيّر أي رواتب أو نسب سابقة ولا سياسات عزل المراكز.
-- subscription_percentage = قيمة الاشتراك كاملة، percentage = المحصّل (السلوك القديم).
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS pay_model TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(12,2);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS pay_notes TEXT;

-- لقطة النسبة وقت اعتماد كشف الشهر؛ تفصيل الطلاب محفوظ داخل lines (JSONB).
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS rate DECIMAL(12,2);

-- ربط كل دفعة راتب بسند صرف مستقل، ودعم الصرف الجزئي.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payroll_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS teacher_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS method TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_payroll ON expenses(payroll_id);
