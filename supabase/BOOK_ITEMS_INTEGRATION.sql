-- =============================================================================
-- BOOK_ITEMS INTEGRATION MIGRATION
-- =============================================================================
-- Updates checkout_loan, return_loan, renew_loan to use book_items table
-- Adds item_id, issued_by, renewals_count to loans
-- Creates sync trigger that properly maintains books.available_copies
-- =============================================================================

-- Ensure loans has the extra columns
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.book_items(id) ON DELETE SET NULL;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS renewals_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Index for item_id lookups
CREATE INDEX IF NOT EXISTS loans_item_id_idx ON public.loans (item_id);

-- =============================================================================
-- 1. UPDATED checkout_loan - assigns a specific book item
-- =============================================================================
CREATE OR REPLACE FUNCTION checkout_loan(
  p_book_id uuid,
  p_member_id uuid,
  p_days integer,
  p_issued_by uuid DEFAULT NULL  -- staff user who processed the checkout
)
RETURNS loans
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_book books%rowtype;
  v_member members%rowtype;
  v_item book_items%rowtype;
  v_due timestamptz;
  v_loan loans%rowtype;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 60 THEN
    RAISE EXCEPTION 'Loan period must be between 1 and 60 days.';
  END IF;

  -- Lock book
  SELECT * INTO v_book FROM books WHERE id = p_book_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book not found.'; END IF;

  -- Lock member
  SELECT * INTO v_member FROM members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
  IF NOT v_member.active THEN RAISE EXCEPTION 'Member is inactive.'; END IF;

  -- Find and lock an AVAILABLE book item for this book
  SELECT * INTO v_item
  FROM book_items
  WHERE book_id = p_book_id
    AND status = 'available'
  FOR UPDATE
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Fallback: if no item rows exist, check books.available_copies > 0
    UPDATE books
       SET available_copies = available_copies - 1
     WHERE id = p_book_id AND available_copies > 0
     RETURNING * INTO v_book;
    IF NOT FOUND THEN RAISE EXCEPTION 'No copies available.'; END IF;
    
    v_item := NULL;  -- no specific item assigned
  ELSE
    -- Mark the item as on_loan
    UPDATE book_items
       SET status = 'on_loan'
     WHERE id = v_item.id;
  END IF;

  v_due := now() + make_interval(days => p_days);

  INSERT INTO loans (book_id, member_id, item_id, borrowed_at, due_at, returned_at, status, issued_by, renewals_count)
  VALUES (p_book_id, p_member_id, v_item.id, now(), v_due, null, 'active', p_issued_by, 0)
  RETURNING * INTO v_loan;

  INSERT INTO notifications (type, title, message, related_id, read, created_at)
  VALUES (
    'checked_out',
    'Book checked out',
    v_member.name || ' checked out "' || v_book.title || '". Due ' || to_char(v_due, 'Mon DD, YYYY') || '.',
    v_loan.id,
    false,
    now()
  );

  -- Sync books.available_copies from book_items + active loans
  PERFORM public.sync_book_availability_after_change(p_book_id);

  RETURN v_loan;
END;
$$;

-- =============================================================================
-- 2. UPDATED return_loan - marks book item as available
-- =============================================================================
CREATE OR REPLACE FUNCTION return_loan(p_loan_id uuid)
RETURNS loans
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_loan loans%rowtype;
  v_book books%rowtype;
  v_member members%rowtype;
  v_item book_items%rowtype;
BEGIN
  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found.'; END IF;
  IF v_loan.status = 'returned' THEN RAISE EXCEPTION 'Loan already returned.'; END IF;

  SELECT * INTO v_book FROM books WHERE id = v_loan.book_id FOR UPDATE;
  SELECT * INTO v_member FROM members WHERE id = v_loan.member_id FOR UPDATE;

  -- If loan has an item_id, mark that item as available
  IF v_loan.item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM book_items WHERE id = v_loan.item_id FOR UPDATE;
    IF FOUND THEN
      UPDATE book_items
         SET status = 'available'
       WHERE id = v_loan.item_id;
    END IF;
  END IF;

  UPDATE loans
     SET status = 'returned',
         returned_at = COALESCE(returned_at, now())
   WHERE id = p_loan_id AND status <> 'returned'
   RETURNING * INTO v_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan already returned.'; END IF;

  -- Sync books.available_copies from book_items + active loans
  PERFORM public.sync_book_availability_after_change(v_loan.book_id);

  INSERT INTO notifications (type, title, message, related_id, read, created_at)
  VALUES (
    'returned',
    'Book returned',
    v_member.name || ' returned "' || v_book.title || '".',
    v_loan.id::text,
    false,
    now()
  );

  RETURN v_loan;
END;
$$;

-- =============================================================================
-- 3. UPDATED renew_loan - includes item_id in renewal notification
-- =============================================================================
CREATE OR REPLACE FUNCTION renew_loan(p_loan_id uuid, p_extra_days integer)
RETURNS loans
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_loan loans%rowtype;
  v_member members%rowtype;
  v_due timestamptz;
BEGIN
  IF p_extra_days IS NULL OR p_extra_days < 1 OR p_extra_days > 60 THEN
    RAISE EXCEPTION 'Extra days must be between 1 and 60.';
  END IF;

  SELECT * INTO v_loan FROM loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found.'; END IF;
  IF v_loan.status = 'returned' THEN RAISE EXCEPTION 'Cannot renew a returned loan.'; END IF;

  SELECT * INTO v_member FROM members WHERE id = v_loan.member_id FOR UPDATE;
  IF NOT v_member.active THEN RAISE EXCEPTION 'Member is inactive.'; END IF;

  v_due := GREATEST(now(), v_loan.due_at) + make_interval(days => p_extra_days);

  UPDATE loans
     SET due_at = v_due,
         status = 'active',
         renewals_count = renewals_count + 1
   WHERE id = p_loan_id AND status <> 'returned'
   RETURNING * INTO v_loan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cannot renew a returned loan.'; END IF;

  INSERT INTO notifications (type, title, message, related_id, read, created_at)
  VALUES (
    'renewed',
    'Loan renewed',
    '"' || (SELECT title FROM books WHERE id = v_loan.book_id) || '" for ' ||
    (SELECT name FROM members WHERE id = v_loan.member_id) || ' is now due ' || to_char(v_due, 'Mon DD, YYYY') || '.',
    v_loan.id::text,
    false,
    now()
  );

  RETURN v_loan;
END;
$$;

-- =============================================================================
-- 4. NEW SYNC FUNCTION - maintains books.available_copies correctly
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_book_availability_after_change(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_available integer;
  v_on_loan integer;
  v_unavailable integer;
BEGIN
  -- Count available items (status = 'available')
  SELECT COALESCE(COUNT(*), 0) INTO v_available
  FROM book_items
  WHERE book_id = p_book_id AND status = 'available';

  -- Count items on loan (status = 'on_loan')
  SELECT COALESCE(COUNT(*), 0) INTO v_on_loan
  FROM book_items
  WHERE book_id = p_book_id AND status = 'on_loan';

  -- Count unavailable items (damaged, lost, withdrawn)
  SELECT COALESCE(COUNT(*), 0) INTO v_unavailable
  FROM book_items
  WHERE book_id = p_book_id AND status IN ('damaged', 'lost', 'withdrawn');

  -- Update books: total_copies = total items, available_copies = available items
  -- If no book_items exist, fall back to existing books.available_copies logic
  IF (v_available + v_on_loan + v_unavailable) > 0 THEN
    UPDATE books
       SET total_copies = v_available + v_on_loan + v_unavailable,
           available_copies = v_available
     WHERE id = p_book_id;
  ELSE
    -- Fallback: count active loans (legacy behavior)
    SELECT COALESCE(COUNT(*), 0) INTO v_on_loan
    FROM loans
    WHERE book_id = p_book_id AND returned_at IS NULL;
    
    UPDATE books
       SET available_copies = GREATEST(total_copies - v_on_loan, 0)
     WHERE id = p_book_id;
  END IF;
END;
$$;

-- =============================================================================
-- 5. REPLACE sync_book_availability TRIGGER on book_items
-- =============================================================================
DROP TRIGGER IF EXISTS trg_book_items_sync_avail ON public.book_items;
CREATE TRIGGER trg_book_items_sync_avail
  AFTER INSERT OR UPDATE OR DELETE ON public.book_items
  FOR EACH ROW EXECUTE FUNCTION sync_book_availability_after_change(coalesce(new.book_id, old.book_id));

-- =============================================================================
-- 6. TRIGGER on loans to sync after checkout/return
-- =============================================================================
DROP TRIGGER IF EXISTS trg_loans_sync_avail ON public.loans;
CREATE TRIGGER trg_loans_sync_avail
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION sync_book_availability_after_change(coalesce(new.book_id, old.book_id));

-- =============================================================================
-- 7. GRANT EXECUTE on new functions
-- =============================================================================
GRANT EXECUTE ON FUNCTION sync_book_availability_after_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION checkout_loan(uuid, uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION return_loan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION renew_loan(uuid, integer) TO authenticated;

-- =============================================================================
-- 8. RELOAD PostgREST SCHEMA CACHE
-- =============================================================================
SELECT pg_notify('pgrst', 'reload schema');
