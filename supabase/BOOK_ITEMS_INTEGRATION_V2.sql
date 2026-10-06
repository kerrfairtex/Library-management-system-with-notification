-- =============================================================================
-- BOOK_ITEMS INTEGRATION MIGRATION V2 (Fixed trigger syntax)
-- =============================================================================

-- =============================================================================
-- 1. TRIGGER FUNCTION for book_items - maintains books.available_copies
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_book_availability_from_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_available integer;
  v_on_loan integer;
  v_unavailable integer;
BEGIN
  -- Determine which book_id was affected
  v_book_id := COALESCE(NEW.book_id, OLD.book_id);
  IF v_book_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Count available items (status = 'available')
  SELECT COALESCE(COUNT(*), 0) INTO v_available
  FROM book_items
  WHERE book_id = v_book_id AND status = 'available';

  -- Count items on loan (status = 'on_loan')
  SELECT COALESCE(COUNT(*), 0) INTO v_on_loan
  FROM book_items
  WHERE book_id = v_book_id AND status = 'on_loan';

  -- Count unavailable items (damaged, lost, withdrawn)
  SELECT COALESCE(COUNT(*), 0) INTO v_unavailable
  FROM book_items
  WHERE book_id = v_book_id AND status IN ('damaged', 'lost', 'withdrawn');

  -- Update books: total_copies = total items, available_copies = available items
  -- If no book_items exist, fall back to existing books.available_copies logic
  IF (v_available + v_on_loan + v_unavailable) > 0 THEN
    UPDATE books
       SET total_copies = v_available + v_on_loan + v_unavailable,
           available_copies = v_available
     WHERE id = v_book_id;
  ELSE
    -- Fallback: count active loans (legacy behavior)
    SELECT COALESCE(COUNT(*), 0) INTO v_on_loan
    FROM loans
    WHERE book_id = v_book_id AND returned_at IS NULL;
    
    UPDATE books
       SET available_copies = GREATEST(total_copies - v_on_loan, 0)
     WHERE id = v_book_id;
  END IF;

  RETURN NULL;
END;
$$;

-- =============================================================================
-- 2. TRIGGER FUNCTION for loans - maintains books.available_copies after checkout/return
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_book_availability_from_loans()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_available integer;
  v_on_loan integer;
  v_unavailable integer;
  v_active_loans integer;
BEGIN
  -- Determine which book_id was affected
  v_book_id := COALESCE(NEW.book_id, OLD.book_id);
  IF v_book_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Count available items (status = 'available')
  SELECT COALESCE(COUNT(*), 0) INTO v_available
  FROM book_items
  WHERE book_id = v_book_id AND status = 'available';

  -- Count items on loan (status = 'on_loan')
  SELECT COALESCE(COUNT(*), 0) INTO v_on_loan
  FROM book_items
  WHERE book_id = v_book_id AND status = 'on_loan';

  -- Count unavailable items (damaged, lost, withdrawn)
  SELECT COALESCE(COUNT(*), 0) INTO v_unavailable
  FROM book_items
  WHERE book_id = v_book_id AND status IN ('damaged', 'lost', 'withdrawn');

  -- Update books based on book_items if they exist
  IF (v_available + v_on_loan + v_unavailable) > 0 THEN
    UPDATE books
       SET total_copies = v_available + v_on_loan + v_unavailable,
           available_copies = v_available
     WHERE id = v_book_id;
  ELSE
    -- Fallback: count active loans (legacy behavior)
    SELECT COALESCE(COUNT(*), 0) INTO v_active_loans
    FROM loans
    WHERE book_id = v_book_id AND returned_at IS NULL;
    
    UPDATE books
       SET available_copies = GREATEST(total_copies - v_active_loans, 0)
     WHERE id = v_book_id;
  END IF;

  RETURN NULL;
END;
$$;

-- =============================================================================
-- 3. CREATE TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS trg_book_items_sync_avail ON public.book_items;
CREATE TRIGGER trg_book_items_sync_avail
  AFTER INSERT OR UPDATE OR DELETE ON public.book_items
  FOR EACH ROW EXECUTE FUNCTION sync_book_availability_from_items();

DROP TRIGGER IF EXISTS trg_loans_sync_avail ON public.loans;
CREATE TRIGGER trg_loans_sync_avail
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION sync_book_availability_from_loans();

-- =============================================================================
-- 4. GRANT EXECUTE on trigger functions
-- =============================================================================
GRANT EXECUTE ON FUNCTION sync_book_availability_from_items() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_book_availability_from_loans() TO authenticated;

-- =============================================================================
-- 5. RELOAD PostgREST SCHEMA CACHE
-- =============================================================================
SELECT pg_notify('pgrst', 'reload schema');
