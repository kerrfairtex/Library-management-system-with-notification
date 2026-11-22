-- TRAC Library: enforce renewal rules and make the loan sweep configurable.
-- IDEMPOTENT. NOT EXECUTED. Runs as one transaction.
-- Apply after supabase/security/20261123_core_tables_lockdown.sql.
-- Undo: 20261123_circulation_rules_enforced_down.sql.
--
-- 1. renew_loan(uuid, integer) now refuses a renewal when
--    - the loan already has circulation_rules.max_renewals renewals for the
--      member's type (2 when the type has no rule, Koha's default), or
--    - another member has a pending hold on the title and no copy is on the
--      shelf to fill it (the NYPL / Chicago "holds block renewal" rule).
--    The upper bound on extra days moves from 60 to 365: the real limit is
--    the admin setting circulation.max_renewal_days, checked by the app
--    (src/app/api/loans/[id]/route.ts).
-- 2. sweep_loan_statuses() takes the due-soon window and the alert cooldown
--    as arguments (admin settings circulation.due_soon_window_days and
--    circulation.overdue_alert_cooldown_days) instead of hard-coded 3 and 4.
--    The old zero-argument version is dropped so the RPC is not ambiguous;
--    the defaults keep a bare call working.
-- 3. The circulation functions run with the caller's rights. Nothing but the
--    service role may call them through PostgREST.

begin;

alter table public.loans
  add column if not exists renewals_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- 1. renew_loan
-- ---------------------------------------------------------------------------
create or replace function public.renew_loan(p_loan_id uuid, p_extra_days integer)
returns public.loans
language plpgsql
set search_path = public
as $$
declare
  v_loan loans%rowtype;
  v_member members%rowtype;
  v_due timestamptz;
  v_max_renewals integer;
  v_available integer;
begin
  if p_extra_days is null or p_extra_days < 1 or p_extra_days > 365 then
    raise exception 'Extra days must be between 1 and 365.';
  end if;

  select * into v_loan from loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found.';
  end if;
  if v_loan.status = 'returned' then
    raise exception 'Cannot renew a returned loan.';
  end if;

  select * into v_member from members where id = v_loan.member_id for update;
  if not v_member.active then
    raise exception 'Member is inactive.';
  end if;

  select cr.max_renewals into v_max_renewals
    from circulation_rules cr
   where cr.member_type = v_member.member_type;
  v_max_renewals := coalesce(v_max_renewals, 2);

  if coalesce(v_loan.renewals_count, 0) >= v_max_renewals then
    raise exception 'Renewal limit reached: this loan has been renewed % time%, the most allowed for %.',
      v_loan.renewals_count,
      case when v_loan.renewals_count = 1 then '' else 's' end,
      v_member.member_type;
  end if;

  select available_copies into v_available from books where id = v_loan.book_id;
  if coalesce(v_available, 0) = 0 and exists (
    select 1 from holds h
     where h.book_id = v_loan.book_id
       and h.kind = 'hold'
       and h.status = 'pending'
       and h.member_id <> v_loan.member_id
  ) then
    raise exception 'Cannot renew: another member is waiting for this title. Please return it by the due date.';
  end if;

  v_due := greatest(now(), v_loan.due_at) + make_interval(days => p_extra_days);

  update loans
     set due_at = v_due,
         status = 'active',
         renewals_count = coalesce(renewals_count, 0) + 1
   where id = p_loan_id and status <> 'returned'
   returning * into v_loan;
  if not found then
    raise exception 'Cannot renew a returned loan.';
  end if;

  insert into notifications (type, title, message, related_id, read, created_at)
  values (
    'renewed',
    'Loan renewed',
    '"' || (select title from books where id = v_loan.book_id) || '" for ' ||
    (select name from members where id = v_loan.member_id) || ' is now due ' || to_char(v_due, 'Mon DD, YYYY') || '.',
    v_loan.id::text,
    false,
    now()
  );

  return v_loan;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. sweep_loan_statuses(due_soon_days, cooldown_days)
-- ---------------------------------------------------------------------------
drop function if exists public.sweep_loan_statuses();

create or replace function public.sweep_loan_statuses(
  p_due_soon_days integer default 3,
  p_cooldown_days integer default 4
)
returns table(ran_at timestamptz, marked_overdue integer, overdue_alerts integer, due_soon_alerts integer)
language plpgsql
set search_path = public
as $$
declare
  v_loan record;
  v_marked integer := 0;
  v_overdue_alerts integer := 0;
  v_due_soon_alerts integer := 0;
  v_days integer;
  v_due_soon interval := make_interval(days => greatest(1, least(coalesce(p_due_soon_days, 3), 30)));
  v_cooldown interval := make_interval(days => greatest(1, least(coalesce(p_cooldown_days, 4), 30)));
begin
  perform pg_advisory_xact_lock(hashtext('trac_loan_sweep'));

  update loans set status = 'overdue'
   where status <> 'returned' and due_at < now();
  get diagnostics v_marked = row_count;

  for v_loan in
    select l.id, l.due_at, b.title, m.name
      from loans l
      join books b on b.id = l.book_id
      join members m on m.id = l.member_id
     where l.status <> 'returned' and l.due_at < now()
  loop
    if not exists (
      select 1 from notifications
       where type = 'overdue' and related_id = v_loan.id::text
         and created_at > now() - v_cooldown
    ) then
      v_days := greatest(1, floor(extract(epoch from (now() - v_loan.due_at)) / 86400)::int);
      insert into notifications (type, title, message, related_id, read, created_at)
      values (
        'overdue',
        'Overdue loan',
        '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is ' || v_days ||
        ' day' || case when v_days = 1 then '' else 's' end || ' overdue.',
        v_loan.id::text,
        false,
        now()
      );
      v_overdue_alerts := v_overdue_alerts + 1;
    end if;
  end loop;

  for v_loan in
    select l.id, l.due_at, b.title, m.name
      from loans l
      join books b on b.id = l.book_id
      join members m on m.id = l.member_id
     where l.status <> 'returned' and l.due_at > now() and l.due_at <= now() + v_due_soon
  loop
    if not exists (
      select 1 from notifications
       where type = 'due_soon' and related_id = v_loan.id::text
         and created_at > now() - v_cooldown
    ) then
      v_days := greatest(1, ceil(extract(epoch from (v_loan.due_at - now())) / 86400)::int);
      insert into notifications (type, title, message, related_id, read, created_at)
      values (
        'due_soon',
        'Due soon',
        '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is due in ' || v_days ||
        ' day' || case when v_days = 1 then '' else 's' end || '.',
        v_loan.id::text,
        false,
        now()
      );
      v_due_soon_alerts := v_due_soon_alerts + 1;
    end if;
  end loop;

  ran_at := now();
  marked_overdue := v_marked;
  overdue_alerts := v_overdue_alerts;
  due_soon_alerts := v_due_soon_alerts;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Only the service role calls circulation functions.
-- ---------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('checkout_loan', 'return_loan', 'renew_loan',
                         'sweep_loan_statuses', 'sync_book_availability_after_change')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
