-- TRAC Library: due-date notices written for the patron.
-- IDEMPOTENT. NOT EXECUTED. Runs as one transaction.
-- Run on project wapnzuawqhekgkqpgphj only (see docs/migrations-applied.md).
-- Apply after 20261124_hold_queue.sql.
-- Undo: 20261125_patron_notices_down.sql.
--
-- sweep_loan_statuses() used to insert ONE notice per loan worded for staff
-- ('"Title" borrowed by Juan is 3 days overdue.'); the ownership trigger
-- then copied that same text to the member. Now it inserts two notices with
-- an explicit audience (so the trigger leaves them alone):
--   member: '"Title" is due in 2 days (Dec 3, 2026). Renew it from My loans
--            or return it to the library desk.'
--   staff:  the old wording, unchanged.
-- Same signature, defaults, advisory lock and cooldown as 20261123; the
-- cooldown now looks at the member copy only.

begin;

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
  v_due_text text;
  v_due_soon interval := make_interval(days => greatest(1, least(coalesce(p_due_soon_days, 3), 30)));
  v_cooldown interval := make_interval(days => greatest(1, least(coalesce(p_cooldown_days, 4), 30)));
begin
  perform pg_advisory_xact_lock(hashtext('trac_loan_sweep'));

  update loans set status = 'overdue'
   where status <> 'returned' and due_at < now();
  get diagnostics v_marked = row_count;

  for v_loan in
    select l.id, l.member_id, l.due_at, b.title, m.name
      from loans l
      join books b on b.id = l.book_id
      join members m on m.id = l.member_id
     where l.status <> 'returned' and l.due_at < now()
  loop
    if not exists (
      select 1 from notifications
       where type = 'overdue' and related_id = v_loan.id::text
         and coalesce(audience, 'member') = 'member'
         and created_at > now() - v_cooldown
    ) then
      v_days := greatest(1, floor(extract(epoch from (now() - v_loan.due_at)) / 86400)::int);
      v_due_text := to_char(v_loan.due_at at time zone 'Asia/Manila', 'Mon DD, YYYY');

      insert into notifications (type, title, message, related_id, recipient_member_id, audience, read, created_at)
      values (
        'overdue',
        'Your book is overdue',
        '"' || v_loan.title || '" was due ' || v_due_text || ' (' || v_days ||
          ' day' || case when v_days = 1 then '' else 's' end ||
          ' ago). Please return it to the library desk as soon as you can.',
        v_loan.id::text, v_loan.member_id, 'member', false, now()
      );
      insert into notifications (type, title, message, related_id, audience, read, created_at)
      values (
        'overdue',
        'Overdue loan',
        '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is ' || v_days ||
          ' day' || case when v_days = 1 then '' else 's' end || ' overdue.',
        v_loan.id::text, 'staff', false, now()
      );
      v_overdue_alerts := v_overdue_alerts + 1;
    end if;
  end loop;

  for v_loan in
    select l.id, l.member_id, l.due_at, b.title, m.name
      from loans l
      join books b on b.id = l.book_id
      join members m on m.id = l.member_id
     where l.status <> 'returned' and l.due_at > now() and l.due_at <= now() + v_due_soon
  loop
    if not exists (
      select 1 from notifications
       where type = 'due_soon' and related_id = v_loan.id::text
         and coalesce(audience, 'member') = 'member'
         and created_at > now() - v_cooldown
    ) then
      v_days := greatest(1, ceil(extract(epoch from (v_loan.due_at - now())) / 86400)::int);
      v_due_text := to_char(v_loan.due_at at time zone 'Asia/Manila', 'Mon DD, YYYY');

      insert into notifications (type, title, message, related_id, recipient_member_id, audience, read, created_at)
      values (
        'due_soon',
        'Your book is due soon',
        '"' || v_loan.title || '" is due in ' || v_days ||
          ' day' || case when v_days = 1 then '' else 's' end || ' (' || v_due_text ||
          '). Renew it from My loans or return it to the library desk.',
        v_loan.id::text, v_loan.member_id, 'member', false, now()
      );
      insert into notifications (type, title, message, related_id, audience, read, created_at)
      values (
        'due_soon',
        'Due soon',
        '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is due in ' || v_days ||
          ' day' || case when v_days = 1 then '' else 's' end || '.',
        v_loan.id::text, 'staff', false, now()
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

revoke execute on function public.sweep_loan_statuses(integer, integer) from public, anon, authenticated;
grant execute on function public.sweep_loan_statuses(integer, integer) to service_role;

commit;

notify pgrst, 'reload schema';
