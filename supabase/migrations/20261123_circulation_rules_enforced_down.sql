-- Undo 20261123_circulation_rules_enforced.sql: restores the renew_loan and
-- sweep_loan_statuses() bodies from supabase/schema.sql. The renewals_count
-- column and the execute revokes are left in place (both are harmless).
-- NOT EXECUTED.

begin;

create or replace function public.renew_loan(p_loan_id uuid, p_extra_days integer)
returns loans
language plpgsql
set search_path = public
as $$
declare
  v_loan loans%rowtype;
  v_member members%rowtype;
  v_due timestamptz;
begin
  if p_extra_days is null or p_extra_days < 1 or p_extra_days > 60 then
    raise exception 'Extra days must be between 1 and 60.';
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

  v_due := greatest(now(), v_loan.due_at) + make_interval(days => p_extra_days);

  update loans set due_at = v_due, status = 'active'
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

drop function if exists public.sweep_loan_statuses(integer, integer);

create or replace function public.sweep_loan_statuses()
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
         and created_at > now() - interval '4 days'
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
     where l.status <> 'returned' and l.due_at > now() and l.due_at <= now() + interval '3 days'
  loop
    if not exists (
      select 1 from notifications
       where type = 'due_soon' and related_id = v_loan.id::text
         and created_at > now() - interval '4 days'
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

revoke execute on function public.sweep_loan_statuses() from public, anon, authenticated;
grant execute on function public.sweep_loan_statuses() to service_role;

commit;

notify pgrst, 'reload schema';
