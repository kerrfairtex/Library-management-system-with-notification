-- TRAC Library: automatic hold queue.
-- IDEMPOTENT. NOT EXECUTED. Runs as one transaction.
-- Run on project wapnzuawqhekgkqpgphj only (see docs/migrations-applied.md).
-- Apply after 20261123_circulation_rules_enforced.sql.
-- Undo: 20261124_hold_queue_down.sql.
--
-- 1. holds.suspended_at: a patron can pause a pending hold. A paused hold
--    keeps its place in the queue (Libby's "Suspend") but is skipped when a
--    copy comes free.
-- 2. trap_holds(book, pickup_days): while the title has a copy on the shelf
--    that no ready hold has claimed, the next pending, unpaused hold (by
--    priority, then placed_at) becomes ready with a pickup deadline, and its
--    member gets a hold_ready notice. The book row is locked, so two returns
--    at once cannot promote the same hold or over-promise copies. The app
--    calls it after a return, a cancelled or expired hold, and from the
--    nightly cron (src/lib/store.ts trapHolds / trapAllHolds).
-- 3. A checkout fulfils the borrower's open hold on that title, so a hold
--    collected at the desk no longer sits "ready" until it expires and sends
--    a false "Hold expired" notice.

begin;

alter table public.holds
  add column if not exists suspended_at timestamptz;

create index if not exists holds_queue_order_idx
  on public.holds (book_id, priority, placed_at)
  where status = 'pending' and kind = 'hold';

-- ---------------------------------------------------------------------------
-- 2. trap_holds
-- ---------------------------------------------------------------------------
create or replace function public.trap_holds(p_book_id uuid, p_pickup_days integer default 3)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_available integer;
  v_title text;
  v_claimed integer;
  v_hold holds%rowtype;
  v_expires timestamptz;
  v_days integer := greatest(1, least(coalesce(p_pickup_days, 3), 30));
  v_promoted integer := 0;
begin
  -- Serialises every trap (and checkout_loan, which also locks the book)
  -- for this title.
  select available_copies, title into v_available, v_title
    from books where id = p_book_id
    for update;
  if not found then
    return 0;
  end if;

  loop
    select count(*) into v_claimed
      from holds
     where book_id = p_book_id and kind = 'hold' and status = 'ready';
    exit when coalesce(v_available, 0) - v_claimed <= 0;

    select * into v_hold
      from holds h
     where h.book_id = p_book_id
       and h.kind = 'hold'
       and h.status = 'pending'
       and h.suspended_at is null
       and exists (select 1 from members m where m.id = h.member_id and m.active)
     order by h.priority, h.placed_at, h.id
     limit 1
     for update;
    exit when not found;

    v_expires := now() + make_interval(days => v_days);
    update holds set status = 'ready', expires_at = v_expires where id = v_hold.id;

    insert into notifications (type, title, message, related_id, recipient_member_id, audience, read, created_at)
    values (
      'hold_ready',
      'Your hold is ready',
      '"' || v_title || '" is waiting for you at the library desk. Please pick it up within ' ||
        v_days || ' day' || case when v_days = 1 then '' else 's' end ||
        ' (by ' || to_char(v_expires at time zone 'Asia/Manila', 'Mon DD, YYYY') || ').',
      p_book_id::text,
      v_hold.member_id,
      'member',
      false,
      now()
    );

    v_promoted := v_promoted + 1;
  end loop;

  return v_promoted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Checkout fulfils the borrower's open hold on the title.
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_hold_on_checkout()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update holds
     set status = 'fulfilled',
         fulfilled_loan_id = new.id
   where book_id = new.book_id
     and member_id = new.member_id
     and kind = 'hold'
     and status in ('pending', 'ready');
  return new;
end;
$$;

drop trigger if exists loans_fulfill_hold on public.loans;
create trigger loans_fulfill_hold
  after insert on public.loans
  for each row execute function public.fulfill_hold_on_checkout();

-- Service role only, like the other circulation functions.
revoke execute on function public.trap_holds(uuid, integer) from public, anon, authenticated;
grant execute on function public.trap_holds(uuid, integer) to service_role;
revoke execute on function public.fulfill_hold_on_checkout() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
