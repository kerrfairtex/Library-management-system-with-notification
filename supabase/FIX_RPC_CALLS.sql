-- Fix checkout_loan and return_loan to remove call to non-existent function
-- The triggers will handle sync automatically

-- =============================================================================
-- 1. UPDATED checkout_loan - remove PERFORM call, let triggers handle sync
-- =============================================================================
DROP FUNCTION IF EXISTS checkout_loan(uuid, uuid, integer, uuid);
CREATE OR REPLACE FUNCTION checkout_loan(
  p_book_id uuid,
  p_member_id uuid,
  p_days integer,
  p_issued_by uuid DEFAULT NULL
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

  -- Triggers will sync books.available_copies automatically
  RETURN v_loan;
END;
$$;

-- =============================================================================
-- 2. UPDATED return_loan - remove PERFORM call, let triggers handle sync
-- =============================================================================
DROP FUNCTION IF EXISTS return_loan(uuid);
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

  -- Triggers will sync books.available_copies automatically
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
-- 3. GRANT EXECUTE
-- =============================================================================
GRANT EXECUTE ON FUNCTION checkout_loan(uuid, uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION return_loan(uuid) TO authenticated;

-- =============================================================================
-- 4. RELOAD PostgREST SCHEMA CACHE
-- =============================================================================
SELECT pg_notify('pgrst', 'reload schema');
