-- =============================================================================
-- KOHA UPGRADE MIGRATION - Run in Staging Supabase Dashboard → SQL Editor
-- Adds missing tables/columns from koha-upgrade.sql
-- Run AFTER COMPLETE_SCHEMA_MIGRATION.sql
-- =============================================================================

-- =============================================================================
-- 1. BOOK_ITEMS TABLE (physical copies - Koha items)
-- =============================================================================
create table if not exists public.book_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  barcode text not null,
  status text not null default 'available'
    check (status in ('available', 'on_loan', 'not_for_loan', 'damaged', 'lost', 'withdrawn', 'in_transit')),
  call_number text,
  shelf_location text,
  home_branch text not null default 'MAIN',
  holding_branch text not null default 'MAIN',
  notes text,
  created_at timestamptz not null default now()
);

do $$ begin
  create unique index if not exists book_items_barcode_unique on public.book_items (barcode);
exception when others then raise notice 'book_items_barcode_unique: %', sqlerrm;
end $$;

create index if not exists book_items_book_idx on public.book_items (book_id);
create index if not exists book_items_status_idx on public.book_items (status);

-- Link existing loans to a specific physical copy (nullable for legacy rows)
alter table public.loans add column if not exists item_id uuid
  references public.book_items (id) on delete set null;

-- Renewal tracking (Koha issues.renewals_count)
alter table public.loans add column if not exists renewals_count integer not null default 0;

-- Issuing staff member (Koha issues.issuer_id)
alter table public.loans add column if not exists issued_by uuid
  references public.users (id) on delete set null;

-- =============================================================================
-- 2. HOLDS KIND COLUMN (distinguish holds vs borrow requests)
-- =============================================================================
do $$ begin
  alter table public.holds add column if not exists kind text not null default 'hold';
exception when others then raise notice 'holds.kind column: %', sqlerrm;
end $$;

do $$ begin
  alter table public.holds
    drop constraint if exists holds_kind_check;
  alter table public.holds
    add constraint holds_kind_check
    check (kind in ('hold', 'borrow_request'));
exception when others then raise notice 'holds_kind_check: %', sqlerrm;
end $$;

update public.holds set kind = 'hold' where kind is null or kind = '';

-- Extend status vocabulary for borrow requests (add 'approved')
do $$
declare
  v_conname text;
begin
  select c.conname into v_conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.holds'::regclass
    and c.contype = 'c'
    and a.attname = 'status';
  if v_conname is not null then
    execute format('alter table public.holds drop constraint %I', v_conname);
  end if;
end $$;

alter table public.holds add constraint holds_status_check
  check (status in ('pending', 'ready', 'fulfilled', 'cancelled', 'expired', 'rejected', 'approved'));

-- Unique index for one open hold/request per member per title (includes 'approved')
drop index if exists holds_one_open_per_member;
create unique index if not exists holds_one_open_per_member
  on public.holds (book_id, member_id)
  where status in ('pending', 'ready', 'approved');

-- =============================================================================
-- 3. CIRCULATION_RULES TABLE (per member type policies)
-- =============================================================================
create table if not exists public.circulation_rules (
  id uuid primary key default gen_random_uuid(),
  member_type text not null unique
    check (member_type in ('student', 'staff', 'community')),
  loan_days integer not null default 14,
  renewal_days integer not null default 7,
  max_renewals integer not null default 2,
  max_loans integer not null default 3,
  fine_per_day numeric(6, 2) not null default 0
);

insert into public.circulation_rules (member_type, loan_days, renewal_days, max_renewals, max_loans, fine_per_day)
values
  ('student',   14, 7, 2, 3, 1.00),
  ('staff',     30, 14, 3, 10, 0),
  ('community', 14, 7, 1, 2, 1.00)
on conflict (member_type) do nothing;

-- =============================================================================
-- 3. FINES TABLE (already created in main migration, but ensure it exists)
-- =============================================================================
create table if not exists public.fines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  loan_id uuid references public.loans (id) on delete set null,
  type text not null default 'overdue'
    check (type in ('overdue', 'lost', 'damaged', 'manual_invoice', 'credit', 'forgive')),
  amount numeric(10, 2) not null check (amount >= 0),
  amount_outstanding numeric(10, 2) not null check (amount_outstanding >= 0),
  description text,
  issued_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists fines_member_idx on public.fines (member_id);
create index if not exists fines_open_idx on public.fines (member_id)
  where paid_at is null and amount_outstanding > 0;

-- =============================================================================
-- 4. AVAILABILITY SYNC: keep books.available_copies true to item reality
-- =============================================================================
create or replace function public.sync_book_availability() returns trigger
language plpgsql as $$
begin
  update public.books b
  set available_copies = greatest(
    total_copies - (
      (select count(*) from public.book_items i
       where i.book_id = b.id and i.status in ('damaged','lost','withdrawn'))
      + (select count(*) from public.loans l
         where l.book_id = b.id and l.returned_at is null)
    ), 0)
  where b.id = coalesce(new.book_id, old.book_id);
  return null;
end $$;

drop trigger if exists trg_book_items_sync_avail on public.book_items;
create trigger trg_book_items_sync_avail
after insert or update or delete on public.book_items
for each row execute function public.sync_book_availability();

drop trigger if exists trg_loans_sync_avail on public.loans;
create trigger trg_loans_sync_avail
after insert or update or delete on public.loans
for each row execute function public.sync_book_availability();

-- =============================================================================
-- 5. LOAN CAPACITY GUARD (D1)
-- =============================================================================
create or replace function enforce_loan_capacity() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1 from books where id = new.book_id for update;
  perform 1 from members where id = new.member_id for update;
  if (select count(*) from loans where book_id = new.book_id and status <> 'returned') >=
     (select total_copies from books where id = new.book_id) then
    raise exception 'No copies available.';
  end if;
  if (select count(*) from loans where member_id = new.member_id and status <> 'returned') >= 3 then
    raise exception 'Member already has the maximum of 3 active loans.';
  end if;
  return new;
end;
$$;

drop trigger if exists loans_capacity on loans;
create trigger loans_capacity before insert on loans
  for each row execute function enforce_loan_capacity();

-- =============================================================================
-- 6. TRANSACTIONAL CHECKOUT (D1)
-- =============================================================================
create or replace function checkout_loan(p_book_id uuid, p_member_id uuid, p_days integer)
returns loans
language plpgsql
set search_path = public
as $$
declare
  v_book books%rowtype;
  v_member members%rowtype;
  v_due timestamptz;
  v_loan loans%rowtype;
begin
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'Loan period must be between 1 and 60 days.';
  end if;

  select * into v_book from books where id = p_book_id for update;
  if not found then
    raise exception 'Book not found.';
  end if;

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'Member not found.';
  end if;

  if not v_member.active then
    raise exception 'Member is inactive.';
  end if;

  update books
     set available_copies = available_copies - 1
   where id = p_book_id and available_copies > 0
   returning * into v_book;
  if not found then
    raise exception 'No copies available.';
  end if;

  v_due := now() + make_interval(days => p_days);

  insert into loans (book_id, member_id, borrowed_at, due_at, returned_at, status)
  values (p_book_id, p_member_id, now(), v_due, null, 'active')
  returning * into v_loan;

  insert into notifications (type, title, message, related_id, read, created_at)
  values (
    'checked_out',
    'Book checked out',
    v_member.name || ' checked out "' || v_book.title || '". Due ' || to_char(v_due, 'Mon DD, YYYY') || '.',
    v_loan.id,
    false,
    now()
  );

  if v_book.available_copies = 0 then
    insert into notifications (type, title, message, related_id, read, created_at)
    values (
      'low_stock',
      'No copies available',
      '"' || v_book.title || '" has 0 available copies.',
      p_book_id,
      false,
      now()
    );
  end if;

  return v_loan;
end;
$$;

-- =============================================================================
-- 7. TRANSACTIONAL RETURN (D2)
-- =============================================================================
create or replace function return_loan(p_loan_id uuid)
returns loans
language plpgsql
set search_path = public
as $$
declare
  v_loan loans%rowtype;
  v_book books%rowtype;
  v_member members%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then
    raise exception 'Loan not found.';
  end if;
  if v_loan.status = 'returned' then
    raise exception 'Loan already returned.';
  end if;

  select * into v_book from books where id = v_loan.book_id for update;
  select * into v_member from members where id = v_loan.member_id for update;

  update loans set status = 'returned', returned_at = coalesce(returned_at, now())
   where id = p_loan_id and status <> 'returned'
   returning * into v_loan;
  if not found then
    raise exception 'Loan already returned.';
  end if;

  update books set available_copies = least(total_copies, available_copies + 1)
   where id = v_book.id;

  insert into notifications (type, title, message, related_id, read, created_at)
  values (
    'returned',
    'Book returned',
    v_member.name || ' returned "' || v_book.title || '".',
    v_loan.id::text,
    false,
    now()
  );

  return v_loan;
end;
$$;

-- =============================================================================
-- 8. TRANSACTIONAL RENEW (R2)
-- =============================================================================
create or replace function renew_loan(p_loan_id uuid, p_extra_days integer)
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
  end if.
  if v_loan.status = 'returned' then
    raise exception 'Cannot renew a returned loan.'
  end if.

  select * into v_member from members where id = v_loan.member_id for update;
  if not v_member.active then
    raise exception 'Member is inactive.'
  end if.

  v_due := greatest(now(), v_loan.due_at) + make_interval(days => p_extra_days);

  update loans set due_at = v_due, status = 'active'
   where id = p_loan_id and status <> 'returned'
   returning * into v_loan;
  if not found then
    raise exception 'Cannot renew a returned loan.'
  end if.

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

-- =============================================================================
-- 9. TRANSACTIONAL LOAN SWEEP (D3)
-- =============================================================================
create or replace function sweep_loan_statuses()
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
      insert into notifications (type, title, message, related_id, read, created_at)
      values (
        'due_soon',
        'Due soon',
        '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is due soon.',
        v_loan.id::text,
        false,
        now()
      );
      v_due_soon_alerts := v_due_soon_alerts + 1;
    end if;
  end loop;

  return query select now(), v_marked, v_overdue_alerts, v_due_soon_alerts;
end;
$$;

-- =============================================================================
-- 10. FORCE POSTGREST SCHEMA RELOAD
-- =============================================================================
select pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- select table_name from information_schema.tables where table_schema = 'public' order by table_name;
-- select * from information_schema.columns where table_name = 'book_items' order by ordinal_position;
-- select * from information_schema.columns where table_name = 'circulation_rules' order by ordinal_position;
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.holds'::regclass and contype = 'c';
-- select indexname, indexdef from pg_indexes where tablename = 'holds';