-- Undo 20261124_hold_queue.sql. NOT EXECUTED.
-- holds.suspended_at is kept (dropping it would lose which holds are paused);
-- with trap_holds gone the app falls back to staff marking holds ready.

begin;

drop trigger if exists loans_fulfill_hold on public.loans;
drop function if exists public.fulfill_hold_on_checkout();
drop function if exists public.trap_holds(uuid, integer);
drop index if exists public.holds_queue_order_idx;

commit;

notify pgrst, 'reload schema';
