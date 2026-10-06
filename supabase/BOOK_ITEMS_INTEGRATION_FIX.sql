-- Fix trigger syntax - trigger functions don't take arguments in CREATE TRIGGER
-- The function reads new/old from the trigger context

-- Drop and recreate book_items trigger
DROP TRIGGER IF EXISTS trg_book_items_sync_avail ON public.book_items;
CREATE TRIGGER trg_book_items_sync_avail
  AFTER INSERT OR UPDATE OR DELETE ON public.book_items
  FOR EACH ROW EXECUTE FUNCTION sync_book_availability_after_change();

-- Drop and recreate loans trigger
DROP TRIGGER IF EXISTS trg_loans_sync_avail ON public.loans;
CREATE TRIGGER trg_loans_sync_avail
  AFTER INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION sync_book_availability_after_change();
