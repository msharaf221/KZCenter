-- KZ Center owner mobile + live read access
-- Apply after supabase_schema.sql. Safe to re-run; it preserves existing rows.
-- The legacy center Auth user remains the sync identity. A separate owner Auth user
-- receives SELECT-only access by a row in center_memberships.

BEGIN;

-- Current local payment fields must exist in PostgreSQL before delta sync can upload them.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS collected_by_name TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS voided BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS voided_at TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS voided_by TEXT;

-- One Supabase Auth identity belongs to one center. The old center account can
-- continue using its own auth.uid() as the tenant id; owners map to that tenant.
CREATE TABLE IF NOT EXISTS public.center_memberships (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'center_sync', 'admin', 'accountant', 'secretary', 'supervisor', 'teacher')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS center_memberships_tenant_idx ON public.center_memberships(tenant_id);
ALTER TABLE public.center_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS center_memberships_self_read ON public.center_memberships;
CREATE POLICY center_memberships_self_read ON public.center_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.center_memberships FROM anon, authenticated;
GRANT SELECT ON public.center_memberships TO authenticated;

CREATE OR REPLACE FUNCTION public.current_center_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT cm.tenant_id FROM public.center_memberships cm WHERE cm.user_id = auth.uid()),
    auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.current_center_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    (SELECT cm.role FROM public.center_memberships cm WHERE cm.user_id = auth.uid()),
    CASE WHEN auth.uid() IS NULL THEN NULL ELSE 'center_sync' END
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_center(target_tenant UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT target_tenant IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.center_memberships cm
      WHERE cm.user_id = auth.uid() AND cm.tenant_id = target_tenant
    )
    OR (
      target_tenant = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.center_memberships cm WHERE cm.user_id = auth.uid())
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_center(target_tenant UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT target_tenant IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.center_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.tenant_id = target_tenant
        AND cm.role IN ('center_sync', 'admin')
    )
    OR (
      target_tenant = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.center_memberships cm WHERE cm.user_id = auth.uid())
    )
  )
$$;

-- Mobile app uses this RPC to discover its assigned center and must reject
-- accounts without the owner role. It never accepts a tenant id from the client.
CREATE OR REPLACE FUNCTION public.get_my_center_context()
RETURNS TABLE (tenant_id UUID, role TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.current_center_id(), public.current_center_role()
  WHERE auth.uid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  resolved_tenant UUID := public.current_center_id();
BEGIN
  IF auth.uid() IS NULL OR resolved_tenant IS NULL THEN
    RAISE EXCEPTION 'لا توجد جلسة مركز مصرح بها — ممنوع الوصول';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.tenant_id := resolved_tenant;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.tenant_id IS DISTINCT FROM resolved_tenant THEN
      RAISE EXCEPTION 'لا يمكن نقل صف بين المراكز';
    END IF;
    NEW.tenant_id := OLD.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.current_center_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_center_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_center(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_center(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_center_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_center_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_center_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_center(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_center(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_center_context() TO authenticated;

-- Replace every prior policy on app-owned cloud tables. PostgreSQL combines
-- permissive policies with OR, so leaving one legacy broad policy would defeat
-- the owner read-only policy below.
DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
  tables TEXT[] := ARRAY[
    'students','teachers','courses','groups','payments','attendance','expenses',
    'exams','grades','inventory','inventory_transactions','enrollments','installments',
    'refunds','payroll','teacher_advances','cashbox_sessions','message_templates',
    'message_logs','waitlist','audit_logs','counters','settings','backups'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    FOR policy_name IN
      SELECT p.policyname FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_read_center(tenant_id))',
      table_name || '_center_read', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_center(tenant_id))',
      table_name || '_center_insert', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write_center(tenant_id)) WITH CHECK (public.can_write_center(tenant_id))',
      table_name || '_center_update', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_write_center(tenant_id))',
      table_name || '_center_delete', table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);
  END LOOP;
END $$;

-- Helpful indexes for the mobile owner's date-window queries.
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON public.payments(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON public.expenses(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_tenant_date ON public.refunds(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_students_tenant_created ON public.students(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON public.attendance(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_timestamp ON public.audit_logs(tenant_id, timestamp DESC);

-- One owner-only RPC produces an aggregate snapshot without downloading every
-- payment/attendance row to the phone or relying on PostgREST's row limit.
CREATE OR REPLACE FUNCTION public.get_owner_mobile_snapshot(
  p_date DATE,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  tenant UUID := public.current_center_id();
  result JSONB;
BEGIN
  IF public.current_center_role() IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'owner role required' USING ERRCODE = '42501';
  END IF;

  WITH totals AS (
    SELECT
      COALESCE((
        SELECT SUM(p.amount) FROM public.payments p
        WHERE p.tenant_id = tenant AND p.date = p_date AND p.status = 'paid'
          AND COALESCE(p.deleted, FALSE) = FALSE AND COALESCE(p.voided, FALSE) = FALSE
      ), 0) AS collected,
      COALESCE((
        SELECT SUM(r.amount) FROM public.refunds r
        WHERE r.tenant_id = tenant AND r.date = p_date::TEXT AND COALESCE(r.deleted, FALSE) = FALSE
      ), 0) AS refunds,
      COALESCE((
        SELECT SUM(e.amount) FROM public.expenses e
        WHERE e.tenant_id = tenant AND e.date = p_date AND COALESCE(e.deleted, FALSE) = FALSE
      ), 0) AS expenses
  )
  SELECT jsonb_build_object(
    'date', p_date,
    'center_name', COALESCE((SELECT s.center_name FROM public.settings s WHERE s.id = 'main' AND s.tenant_id = tenant LIMIT 1), 'مركز تعليمي'),
    'currency', COALESCE((SELECT s.currency FROM public.settings s WHERE s.id = 'main' AND s.tenant_id = tenant LIMIT 1), 'EGP'),
    'collected', totals.collected,
    'refunds', totals.refunds,
    'expenses', totals.expenses,
    'net', totals.collected - totals.refunds - totals.expenses,
    'payment_count', COALESCE((
      SELECT COUNT(*) FROM public.payments p
      WHERE p.tenant_id = tenant AND p.date = p_date AND p.status = 'paid'
        AND COALESCE(p.deleted, FALSE) = FALSE AND COALESCE(p.voided, FALSE) = FALSE
    ), 0),
    'new_students', COALESCE((
      SELECT COUNT(*) FROM public.students s
      WHERE s.tenant_id = tenant AND s.created_at >= p_start AND s.created_at < p_end
        AND COALESCE(s.deleted, FALSE) = FALSE
    ), 0),
    'attendance_count', COALESCE((
      SELECT COUNT(*) FROM public.attendance a
      WHERE a.tenant_id = tenant AND a.date = p_date
    ), 0),
    'absent_count', COALESCE((
      SELECT COUNT(*) FROM public.attendance a
      WHERE a.tenant_id = tenant AND a.date = p_date AND a.status = 'absent'
    ), 0),
    'by_method', COALESCE((
      SELECT jsonb_object_agg(method_name, total)
      FROM (
        SELECT COALESCE(p.method, 'cash') AS method_name, SUM(p.amount) AS total
        FROM public.payments p
        WHERE p.tenant_id = tenant AND p.date = p_date AND p.status = 'paid'
          AND COALESCE(p.deleted, FALSE) = FALSE AND COALESCE(p.voided, FALSE) = FALSE
        GROUP BY COALESCE(p.method, 'cash')
      ) methods
    ), '{}'::JSONB),
    'by_collector', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', collector_id,
          'name', collector_name,
          'amount', total,
          'payment_count', payment_count
        ) ORDER BY total DESC, collector_name
      )
      FROM (
        SELECT
          COALESCE(NULLIF(BTRIM(p.collected_by), ''), NULLIF(BTRIM(p.collected_by_name), ''), 'unassigned') AS collector_id,
          COALESCE(MAX(NULLIF(BTRIM(p.collected_by_name), '')), MAX(NULLIF(BTRIM(p.collected_by), '')), 'غير مسجل') AS collector_name,
          SUM(p.amount) AS total,
          COUNT(*) AS payment_count
        FROM public.payments p
        WHERE p.tenant_id = tenant AND p.date = p_date AND p.status = 'paid'
          AND COALESCE(p.deleted, FALSE) = FALSE AND COALESCE(p.voided, FALSE) = FALSE
        GROUP BY COALESCE(NULLIF(BTRIM(p.collected_by), ''), NULLIF(BTRIM(p.collected_by_name), ''), 'unassigned')
      ) collectors
    ), '[]'::JSONB)
  ) INTO result
  FROM totals;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_owner_mobile_snapshot(DATE, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_mobile_snapshot(DATE, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- Realtime is a delivery hint for connected devices, not a durable queue. The
-- mobile client reloads a snapshot on reconnect to recover missed events.
DO $$
DECLARE
  table_name TEXT;
  tables TEXT[] := ARRAY['payments','expenses','refunds','students','attendance','audit_logs'];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY tables LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables p
        WHERE p.pubname = 'supabase_realtime'
          AND p.schemaname = 'public'
          AND p.tablename = table_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  ELSE
    RAISE NOTICE 'supabase_realtime publication is missing; enable Realtime for the listed tables in Supabase.';
  END IF;
END $$;

COMMIT;

-- Owner account setup (run in SQL Editor after creating its Supabase Auth user):
-- INSERT INTO public.center_memberships (user_id, tenant_id, role)
-- VALUES ('OWNER_AUTH_USER_UUID', 'CENTER_SYNC_AUTH_USER_UUID', 'owner')
-- ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role;
-- The owner role can SELECT center data but cannot INSERT, UPDATE, or DELETE.
