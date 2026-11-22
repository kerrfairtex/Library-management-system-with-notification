-- =============================================================================
-- MISSING COLUMNS MIGRATION - Run in Staging Supabase Dashboard → SQL Editor
-- Adds missing columns that didn't get created by the main migration
-- =============================================================================

-- =============================================================================
-- 1. Add auth_user_id to users (canonical Auth mapping)
-- =============================================================================
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id);

-- =============================================================================
-- 2. Add user_id to members (links members to users)
-- =============================================================================
ALTER TABLE public.members 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id);

-- =============================================================================
-- 3. Add missing columns to loans
-- =============================================================================
ALTER TABLE public.loans 
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.book_items (id) ON DELETE SET NULL;

ALTER TABLE public.loans 
  ADD COLUMN IF NOT EXISTS renewals_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.loans 
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.users (id) ON DELETE SET NULL;

-- =============================================================================
-- 4. Update notifications recipient_id to reference auth.users
-- =============================================================================
-- First check if recipient_id column exists, add if missing
ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS recipient_id uuid;

-- Drop existing FK if exists
ALTER TABLE public.notifications 
  DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;

-- Add FK to auth.users
ALTER TABLE public.notifications 
  ADD CONSTRAINT notifications_recipient_id_fkey 
    FOREIGN KEY (recipient_id) REFERENCES auth.users(id);

-- =============================================================================
-- 5. Add holds.kind column (if missing - but it exists based on verification)
-- =============================================================================
-- ALTER TABLE public.holds ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'hold';
-- ALTER TABLE public.holds ADD CONSTRAINT holds_kind_check CHECK (kind in ('hold', 'borrow_request'));

-- =============================================================================
-- 6. Update holds status constraint to include 'approved'
-- =============================================================================
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'public.holds'::regclass
    AND c.contype = 'c'
    AND a.attname = 'status';
  IF v_conname IS NOT NULL THEN
    EXECUTE FORMAT('ALTER TABLE public.holds DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.holds ADD CONSTRAINT holds_status_check
  CHECK (status IN ('pending', 'ready', 'fulfilled', 'cancelled', 'expired', 'rejected', 'approved'));

-- =============================================================================
-- 7. Update unique index for holds to include 'approved'
-- =============================================================================
DROP INDEX IF EXISTS holds_one_open_per_member;
CREATE UNIQUE INDEX IF NOT EXISTS holds_one_open_per_member
  ON public.holds (book_id, member_id)
  WHERE status IN ('pending', 'ready', 'approved');

-- =============================================================================
-- 8. Add missing columns to book_items (if table exists but columns missing)
-- =============================================================================
-- These should have been created with the table, but verify:
-- ALTER TABLE public.book_items ADD COLUMN IF NOT EXISTS call_number text;
-- ALTER TABLE public.book_items ADD COLUMN IF NOT EXISTS shelf_location text;
-- ALTER TABLE public.book_items ADD COLUMN IF NOT EXISTS home_branch text NOT NULL DEFAULT 'MAIN';
-- ALTER TABLE public.book_items ADD COLUMN IF NOT EXISTS holding_branch text NOT NULL DEFAULT 'MAIN';
-- ALTER TABLE public.book_items ADD COLUMN IF NOT EXISTS notes text;

-- =============================================================================
-- 9. Reload schema cache
-- =============================================================================
SELECT pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'members' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'loans' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notifications' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'holds' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'loans' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'book_items' ORDER BY ordinal_position;

-- =============================================================================
-- RELOAD SCHEMA CACHE
-- =============================================================================
SELECT pg_notify('pgrst', 'reload schema');