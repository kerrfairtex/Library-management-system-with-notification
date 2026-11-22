-- =============================================================================
-- SUPABASE_CONFIG_FIX_CORRECTED.sql
-- Target: STAGING only (project ref wapnzuawqhekgkqpgphj)
--
-- Single, idempotent migration. One section per table.
-- Run it inside BEGIN; ... ROLLBACK; first (twice, to prove idempotency),
-- then rerun with COMMIT. This file deliberately contains no BEGIN/COMMIT so
-- that your outer transaction stays in control.
--
-- STATUS: not yet executed. No Postgres was available where it was written.
-- Section 0 (preflight) and section 15 (assertions) are the in-file runtime
-- gates: if either raises, nothing from this run should be committed.
--
-- DESIGN
--   * Every policy on the managed tables is dropped first (section 1), then
--     recreated. Leftover permissive policies are the classic RLS hole.
--   * RLS is enabled on every managed table (service_role bypasses it).
--   * Table privileges are revoked from anon/authenticated/PUBLIC, then
--     granted back minimally.
--   * Students never INSERT or UPDATE holds directly. They use
--     create_own_hold() and cancel_own_hold(). Staff keep direct access
--     through staff-only policies.
--   * UPDATE on holds/loans/fines is column-scoped (id, member_id, created_at
--     are immutable).
--
-- ASSUMPTIONS TO CONFIRM (change here if the real schema differs)
--   A1. holds has: id, member_id, book_id, kind, status, cancelled_reason.
--       holds.id, holds.book_id, holds.member_id, members.id, users.id and
--       notifications.recipient_id are uuid.
--   A2. users.status denylist in is_staff_or_admin()/is_admin(): inactive,
--       suspended, disabled, blocked, banned, deleted.
--   A3. notifications.recipient_id holds either auth.users.id or users.id.
--       The policy accepts both.
--   A4. password_hash is no longer client-insertable (Supabase Auth owns
--       credentials). If an admin UI really inserts it, add it back to the
--       users INSERT grant in section 7.
--   A5. Staff may INSERT/UPDATE books (catalog management). Remove the
--       staff policy and grants in section 3 if that is done via service_role.
--   A6. Clients must list columns explicitly on users and book_items.
--       SELECT * fails by design because password_hash / notes are hidden.
--   A7. holds has no NOT NULL column without a default beyond
--       (member_id, book_id, kind, status).
-- =============================================================================

-- =============================================================================
-- 0. PREFLIGHT: fail fast with a readable message if the schema differs
-- =============================================================================

DO $$
DECLARE
  v_missing_tables text[];
  v_missing_cols   text[];
  v_bad_types      text[];
BEGIN
  SELECT array_agg(t.tbl)
    INTO v_missing_tables
  FROM unnest(ARRAY[
    'books', 'book_items', 'settings', 'circulation_rules', 'users',
    'members', 'loans', 'holds', 'fines', 'notifications'
  ]) AS t(tbl)
  WHERE to_regclass('public.' || t.tbl) IS NULL;

  IF v_missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Preflight failed. Missing tables: %',
      array_to_string(v_missing_tables, ', ');
  END IF;

  SELECT array_agg(t.tbl || '.' || t.col)
    INTO v_missing_cols
  FROM (VALUES
    ('users', 'id'), ('users', 'name'), ('users', 'email'),
    ('users', 'role'), ('users', 'status'), ('users', 'created_at'),
    ('users', 'auth_user_id'),
    ('members', 'id'), ('members', 'user_id'),
    ('loans', 'member_id'),
    ('holds', 'id'), ('holds', 'member_id'), ('holds', 'book_id'),
    ('holds', 'kind'), ('holds', 'status'), ('holds', 'cancelled_reason'),
    ('fines', 'member_id'),
    ('notifications', 'recipient_id'),
    ('books', 'id'),
    ('book_items', 'id'), ('book_items', 'book_id'),
    ('book_items', 'barcode'), ('book_items', 'status'),
    ('book_items', 'call_number'), ('book_items', 'shelf_location'),
    ('book_items', 'home_branch'), ('book_items', 'holding_branch'),
    ('book_items', 'created_at'), ('book_items', 'notes')
  ) AS t(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name::text = t.tbl
      AND c.column_name::text = t.col
  );

  IF v_missing_cols IS NOT NULL THEN
    RAISE EXCEPTION 'Preflight failed. Missing columns: %',
      array_to_string(v_missing_cols, ', ');
  END IF;

  SELECT array_agg(c.table_name::text || '.' || c.column_name::text || ' is ' || c.data_type::text)
    INTO v_bad_types
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND (c.table_name::text, c.column_name::text) IN (
      ('holds', 'id'), ('holds', 'book_id'), ('holds', 'member_id'),
      ('members', 'id'), ('users', 'id'), ('notifications', 'recipient_id')
    )
    AND c.data_type <> 'uuid';

  IF v_bad_types IS NOT NULL THEN
    RAISE EXCEPTION 'Preflight failed. Expected uuid but found: %. Adjust the function signatures in section 14.',
      array_to_string(v_bad_types, '; ');
  END IF;
END $$;

-- =============================================================================
-- 1. ENABLE RLS AND CLEAR EVERY EXISTING POLICY ON THE MANAGED TABLES
-- =============================================================================

ALTER TABLE public.books             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circulation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'books', 'book_items', 'settings', 'circulation_rules', 'users',
        'members', 'loans', 'holds', 'fines', 'notifications'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- =============================================================================
-- 2. HELPER FUNCTIONS (hardened SECURITY DEFINER, empty search_path)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role IN ('librarian', 'admin')
      AND COALESCE(lower(u.status::text), 'active')
          NOT IN ('inactive', 'suspended', 'disabled', 'blocked', 'banned', 'deleted')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff_or_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND COALESCE(lower(u.status::text), 'active')
          NOT IN ('inactive', 'suspended', 'disabled', 'blocked', 'banned', 'deleted')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id
  FROM public.members m
  JOIN public.users u ON u.id = m.user_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_member_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;

-- =============================================================================
-- 3. BOOKS: public catalog read, staff write
-- =============================================================================

REVOKE ALL ON public.books FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Public can read books catalog" ON public.books;
CREATE POLICY "Public can read books catalog" ON public.books
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff insert books" ON public.books;
CREATE POLICY "Staff insert books" ON public.books
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff update books" ON public.books;
CREATE POLICY "Staff update books" ON public.books
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_or_admin()))
  WITH CHECK ((SELECT public.is_staff_or_admin()));

GRANT SELECT ON public.books TO anon, authenticated;
GRANT INSERT, UPDATE ON public.books TO authenticated;

-- =============================================================================
-- 4. BOOK_ITEMS: notes column private (column-level SELECT only)
-- =============================================================================

REVOKE ALL ON public.book_items FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Public read book_items" ON public.book_items;
CREATE POLICY "Public read book_items" ON public.book_items
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff manage book_items" ON public.book_items;
CREATE POLICY "Staff manage book_items" ON public.book_items
  FOR ALL TO authenticated
  USING ((SELECT public.is_staff_or_admin()))
  WITH CHECK ((SELECT public.is_staff_or_admin()));

GRANT SELECT (id, book_id, barcode, status, call_number, shelf_location, home_branch, holding_branch, created_at)
  ON public.book_items TO anon, authenticated;
GRANT INSERT, UPDATE ON public.book_items TO authenticated;

-- =============================================================================
-- 5. SETTINGS: admin only
-- =============================================================================

REVOKE ALL ON public.settings FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Admins read settings" ON public.settings;
CREATE POLICY "Admins read settings" ON public.settings
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins insert settings" ON public.settings;
CREATE POLICY "Admins insert settings" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admins update settings" ON public.settings;
CREATE POLICY "Admins update settings" ON public.settings
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;

-- =============================================================================
-- 6. CIRCULATION_RULES: admin only
-- =============================================================================

REVOKE ALL ON public.circulation_rules FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Admin manage circulation_rules" ON public.circulation_rules;
CREATE POLICY "Admin manage circulation_rules" ON public.circulation_rules
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

GRANT SELECT, INSERT, UPDATE ON public.circulation_rules TO authenticated;

-- =============================================================================
-- 7. USERS: password_hash hidden, column-level grants
-- =============================================================================

REVOKE ALL ON public.users FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "User read own profile" ON public.users;
CREATE POLICY "User read own profile" ON public.users
  FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admin select users" ON public.users;
CREATE POLICY "Admin select users" ON public.users
  FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin insert users" ON public.users;
CREATE POLICY "Admin insert users" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin update users" ON public.users;
CREATE POLICY "Admin update users" ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Admin delete users" ON public.users;
CREATE POLICY "Admin delete users" ON public.users
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT (id, name, email, role, status, created_at, auth_user_id)
  ON public.users TO authenticated;
GRANT INSERT (id, name, email, role, status, auth_user_id, created_at)
  ON public.users TO authenticated;
GRANT UPDATE (name, email, role, status, auth_user_id)
  ON public.users TO authenticated;
GRANT DELETE ON public.users TO authenticated;

-- =============================================================================
-- 8. MEMBERS
-- =============================================================================

REVOKE ALL ON public.members FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Student own member" ON public.members;
CREATE POLICY "Student own member" ON public.members
  FOR SELECT TO authenticated
  USING (id = (SELECT public.current_member_id()));

DROP POLICY IF EXISTS "Staff select members" ON public.members;
CREATE POLICY "Staff select members" ON public.members
  FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff insert members" ON public.members;
CREATE POLICY "Staff insert members" ON public.members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff update members" ON public.members;
CREATE POLICY "Staff update members" ON public.members
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_or_admin()))
  WITH CHECK ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff delete members" ON public.members;
CREATE POLICY "Staff delete members" ON public.members
  FOR DELETE TO authenticated
  USING ((SELECT public.is_staff_or_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;

-- =============================================================================
-- 9. LOANS: students read own, staff insert/update (no DELETE)
--    UPDATE grant is column-scoped in section 13.
-- =============================================================================

REVOKE ALL ON public.loans FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Student own loans" ON public.loans;
CREATE POLICY "Student own loans" ON public.loans
  FOR SELECT TO authenticated
  USING (member_id = (SELECT public.current_member_id()));

DROP POLICY IF EXISTS "Staff select loans" ON public.loans;
CREATE POLICY "Staff select loans" ON public.loans
  FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff insert loans" ON public.loans;
CREATE POLICY "Staff insert loans" ON public.loans
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff update loans" ON public.loans;
CREATE POLICY "Staff update loans" ON public.loans
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_or_admin()))
  WITH CHECK ((SELECT public.is_staff_or_admin()));

GRANT SELECT, INSERT ON public.loans TO authenticated;

-- =============================================================================
-- 10. HOLDS: students read only; create/cancel via RPC (section 14)
--     There is intentionally NO student INSERT or UPDATE policy. Table-level
--     INSERT is granted because the only INSERT policy is staff-only.
--     UPDATE grant is column-scoped in section 13.
-- =============================================================================

REVOKE ALL ON public.holds FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Student own holds" ON public.holds;
CREATE POLICY "Student own holds" ON public.holds
  FOR SELECT TO authenticated
  USING (member_id = (SELECT public.current_member_id()));

DROP POLICY IF EXISTS "Staff select holds" ON public.holds;
CREATE POLICY "Staff select holds" ON public.holds
  FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff insert holds" ON public.holds;
CREATE POLICY "Staff insert holds" ON public.holds
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff update holds" ON public.holds;
CREATE POLICY "Staff update holds" ON public.holds
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_or_admin()))
  WITH CHECK ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff delete holds" ON public.holds;
CREATE POLICY "Staff delete holds" ON public.holds
  FOR DELETE TO authenticated
  USING ((SELECT public.is_staff_or_admin()));

GRANT SELECT, INSERT, DELETE ON public.holds TO authenticated;

-- =============================================================================
-- 11. FINES: students read own, staff read/update
--     UPDATE grant is column-scoped in section 13.
-- =============================================================================

REVOKE ALL ON public.fines FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Student own fines" ON public.fines;
CREATE POLICY "Student own fines" ON public.fines
  FOR SELECT TO authenticated
  USING (member_id = (SELECT public.current_member_id()));

DROP POLICY IF EXISTS "Staff select fines" ON public.fines;
CREATE POLICY "Staff select fines" ON public.fines
  FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_or_admin()));

DROP POLICY IF EXISTS "Staff update fines" ON public.fines;
CREATE POLICY "Staff update fines" ON public.fines
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_or_admin()))
  WITH CHECK ((SELECT public.is_staff_or_admin()));

GRANT SELECT ON public.fines TO authenticated;

-- =============================================================================
-- 12. NOTIFICATIONS
--     recipient_id may reference auth.users.id or public.users.id, so the
--     policy accepts either. Narrow it once the real FK is confirmed.
-- =============================================================================

REVOKE ALL ON public.notifications FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Student own notifications" ON public.notifications;
CREATE POLICY "Student own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id = (SELECT auth.uid())
    OR recipient_id IN (
      SELECT u.id FROM public.users u WHERE u.auth_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON public.notifications TO authenticated;

-- =============================================================================
-- 13. COLUMN-SCOPED UPDATE GRANTS (holds, loans, fines)
--     Everything except id, member_id and created_at may be updated.
-- =============================================================================

DO $$
DECLARE
  r record;
  v_cols text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('holds', ARRAY['id', 'member_id', 'created_at']),
      ('loans', ARRAY['id', 'member_id', 'created_at']),
      ('fines', ARRAY['id', 'member_id', 'created_at'])
    ) AS t(tbl, immutable_cols)
  LOOP
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
      INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name::text = r.tbl
      AND c.column_name::text <> ALL (r.immutable_cols);

    IF v_cols IS NULL THEN
      RAISE EXCEPTION 'No updatable columns found for public.%', r.tbl;
    END IF;

    EXECUTE format('REVOKE UPDATE ON public.%I FROM authenticated', r.tbl);
    EXECUTE format('GRANT UPDATE (%s) ON public.%I TO authenticated', v_cols, r.tbl);
  END LOOP;
END $$;

-- =============================================================================
-- 14. RPCs
-- =============================================================================

-- 14a. Student creates a hold or borrow request. Only member_id, book_id,
--      kind and status are ever written; everything else takes its default.
CREATE OR REPLACE FUNCTION public.create_own_hold(
  p_book_id uuid,
  p_kind text DEFAULT 'hold'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_hold_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_book_id IS NULL THEN
    RAISE EXCEPTION 'book id is required';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('hold', 'borrow_request') THEN
    RAISE EXCEPTION 'Invalid hold kind';
  END IF;

  v_member_id := public.current_member_id();

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'No member record for current user';
  END IF;

  -- Literals are inlined so this works whether kind/status are text or enums.
  -- p_kind is whitelisted above and quoted with %L.
  EXECUTE format(
    'INSERT INTO public.holds (member_id, book_id, kind, status) VALUES ($1, $2, %L, %L) RETURNING id',
    p_kind,
    'pending'
  )
  INTO v_hold_id
  USING v_member_id, p_book_id;

  RETURN v_hold_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_own_hold(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_own_hold(uuid, text) TO authenticated;

-- 14b. Student cancels their own pending/ready hold. The row is locked to
--      prevent races with staff fulfilling it at the same moment.
CREATE OR REPLACE FUNCTION public.cancel_own_hold(p_hold_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_id uuid;
  v_hold public.holds%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_member_id := public.current_member_id();

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'No member record for current user';
  END IF;

  SELECT * INTO v_hold
  FROM public.holds
  WHERE id = p_hold_id
  FOR UPDATE;

  -- Same message for "missing" and "not yours" so ids cannot be probed.
  IF NOT FOUND OR v_hold.member_id <> v_member_id THEN
    RAISE EXCEPTION 'Hold not found';
  END IF;

  IF v_hold.status::text NOT IN ('pending', 'ready') THEN
    RAISE EXCEPTION 'Hold cannot be cancelled in current status: %', v_hold.status;
  END IF;

  UPDATE public.holds
  SET status = 'cancelled',
      cancelled_reason = 'Cancelled by student'
  WHERE id = p_hold_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_own_hold(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_hold(uuid) TO authenticated;

-- 14c. Staff-only read path for the private book_items.notes column.
CREATE OR REPLACE FUNCTION public.staff_get_book_item_notes(p_barcode text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notes text;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT bi.notes::text INTO v_notes
  FROM public.book_items bi
  WHERE bi.barcode::text = p_barcode
  LIMIT 1;

  RETURN v_notes;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_get_book_item_notes(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_get_book_item_notes(text) TO authenticated;

-- =============================================================================
-- 15. POST-MIGRATION ASSERTIONS (raise if the resulting state is unsafe)
-- =============================================================================

DO $$
DECLARE
  v_tbl text;
  v_fail text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'books', 'book_items', 'settings', 'circulation_rules', 'users',
    'members', 'loans', 'holds', 'fines', 'notifications'
  ]
  LOOP
    IF NOT (
      SELECT c.relrowsecurity
      FROM pg_class c
      WHERE c.oid = ('public.' || v_tbl)::regclass
    ) THEN
      v_fail := array_append(v_fail, v_tbl || ': RLS not enabled');
    END IF;

    IF has_any_column_privilege('anon', 'public.' || v_tbl, 'INSERT')
       OR has_any_column_privilege('anon', 'public.' || v_tbl, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_tbl, 'DELETE') THEN
      v_fail := array_append(v_fail, v_tbl || ': anon has write privileges');
    END IF;
  END LOOP;

  FOREACH v_tbl IN ARRAY ARRAY[
    'settings', 'circulation_rules', 'users', 'members', 'loans',
    'holds', 'fines', 'notifications'
  ]
  LOOP
    IF has_any_column_privilege('anon', 'public.' || v_tbl, 'SELECT') THEN
      v_fail := array_append(v_fail, v_tbl || ': anon can SELECT');
    END IF;
  END LOOP;

  IF has_column_privilege('authenticated', 'public.users', 'password_hash', 'SELECT') THEN
    v_fail := array_append(v_fail, 'authenticated can SELECT users.password_hash');
  END IF;

  IF has_column_privilege('anon', 'public.book_items', 'notes', 'SELECT')
     OR has_column_privilege('authenticated', 'public.book_items', 'notes', 'SELECT') THEN
    v_fail := array_append(v_fail, 'book_items.notes is readable by anon/authenticated');
  END IF;

  IF has_table_privilege('authenticated', 'public.holds', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.holds', 'member_id', 'UPDATE') THEN
    v_fail := array_append(v_fail, 'authenticated has unscoped UPDATE on holds');
  END IF;

  IF has_table_privilege('authenticated', 'public.loans', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.fines', 'UPDATE') THEN
    v_fail := array_append(v_fail, 'authenticated has table-wide UPDATE on loans/fines');
  END IF;

  IF NOT has_table_privilege('anon', 'public.books', 'SELECT') THEN
    v_fail := array_append(v_fail, 'anon cannot SELECT books');
  END IF;

  IF has_function_privilege('anon', 'public.create_own_hold(uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cancel_own_hold(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_staff_or_admin()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') THEN
    v_fail := array_append(v_fail, 'anon can EXECUTE a protected function');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'holds'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%is_staff_or_admin%'
  ) THEN
    v_fail := array_append(v_fail, 'holds has a non-staff write policy');
  END IF;

  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION 'Post-migration assertions failed: %', array_to_string(v_fail, '; ');
  END IF;
END $$;

-- END OF MIGRATION
