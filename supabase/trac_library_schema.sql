-- TRAC Library Management — combined schema, ported into the dedicated
-- 'trac_library' schema on the shared Supabase cluster.
-- Part 1: base schema (schema.sql)   Part 2: Koha-inspired upgrade.
-- Idempotent; safe to re-run.

create extension if not exists pgcrypto;
create schema if not exists trac_library;

grant usage on schema trac_library to anon, authenticated, service_role;

-- TRAC Library Management System — Supabase schema
--
-- Run this once in the Supabase SQL editor (or via `supabase db execute`)
-- before using the app. It creates the tables the app's data layer
-- (src/lib/store.ts) expects, using the same snake_case column names.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

create table if not exists trac_library.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table trac_library.users
  alter column role set default 'student';

do $$
begin
  alter table trac_library.users
    drop constraint if exists users_role_check;
  alter table trac_library.users
    add constraint users_role_check
    check (role in ('student', 'librarian', 'admin'));
exception
  when others then
    raise notice 'Could not apply users_role_check: %', sqlerrm;
end $$;

-- Membership verification gate: Google self-sign-ups are created 'pending'
-- and activated by an admin (or land 'active' when an allowlist matched).
do $$
begin
  alter table trac_library.users add column if not exists status text;
exception
  when others then
    raise notice 'Could not add users.status: %', sqlerrm;
end $$;

update trac_library.users set status = 'active' where status is null or status = '';

alter table trac_library.users
  alter column status set default 'active';

do $$
begin
  alter table trac_library.users alter column status set not null;
exception
  when others then
    raise notice 'Could not set users.status NOT NULL: %', sqlerrm;
end $$;

do $$
begin
  alter table trac_library.users
    drop constraint if exists users_status_check;
  alter table trac_library.users
    add constraint users_status_check
    check (status in ('pending', 'active'));
exception
  when others then
    raise notice 'Could not apply users_status_check: %', sqlerrm;
end $$;

create table if not exists trac_library.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  isbn text not null,
  genre text not null,
  total_copies integer not null default 1 check (total_copies >= 0),
  available_copies integer not null default 1 check (available_copies >= 0),
  published_year integer not null,
  created_at timestamptz not null default now(),
  constraint books_available_within_total check (available_copies <= total_copies)
);

-- Koha-style item taxonomy (idempotent additive migration): a book belongs
-- to a category, sits at a shelf location inside the library, and carries a
-- call number for spine-label ordering. All optional so existing rows stay valid.
do $$ begin
  alter table trac_library.books add column if not exists category text not null default 'General';
  alter table trac_library.books add column if not exists shelf_location text;
  alter table trac_library.books add column if not exists call_number text;
exception when others then
  raise notice 'books taxonomy columns: %', sqlerrm;
end $$;

create index if not exists books_category_idx on trac_library.books (category);

-- Copy-count guards. The app checks availability before lending, but two
-- simultaneous checkouts of the last copy would both pass that check, so the
-- database has the final say.
do $$
begin
  alter table trac_library.books
    drop constraint if exists books_total_copies_check;
  alter table trac_library.books
    add constraint books_total_copies_check check (total_copies >= 0);

  alter table trac_library.books
    drop constraint if exists books_available_copies_check;
  alter table trac_library.books
    add constraint books_available_copies_check check (available_copies >= 0);

  alter table trac_library.books
    drop constraint if exists books_available_within_total;
  alter table trac_library.books
    add constraint books_available_within_total
    check (available_copies <= total_copies);
exception
  when others then
    raise notice 'Could not apply books copy-count constraints: %', sqlerrm;
end $$;

-- One catalog row per ISBN; extra physical copies belong in total_copies.
do $$
begin
  create unique index if not exists books_isbn_unique
    on trac_library.books (isbn)
    where isbn <> '';
exception
  when others then
    raise notice 'Could not create books_isbn_unique (duplicate ISBNs?): %', sqlerrm;
end $$;

create table if not exists trac_library.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  member_type text not null default 'student' check (member_type in ('student', 'staff', 'community')),
  student_id text,
  grade text,
  joined_at timestamptz not null default now(),
  active boolean not null default true
);

-- Idempotent upgrades for databases created before student fields existed.
alter table trac_library.members add column if not exists member_type text;
alter table trac_library.members add column if not exists student_id text;
alter table trac_library.members add column if not exists grade text;

update trac_library.members
set member_type = 'student'
where member_type is null or member_type = '';

alter table trac_library.members
  alter column member_type set default 'student';

-- Backfill + constrain without failing on re-runs. Failures raise a notice
-- rather than passing silently, so a legacy row with a bad member_type is
-- visible in the SQL editor output instead of leaving the column unconstrained.
do $$
begin
  alter table trac_library.members alter column member_type set not null;
exception
  when others then
    raise notice 'Could not set members.member_type NOT NULL: %', sqlerrm;
end $$;

do $$
begin
  alter table trac_library.members
    drop constraint if exists members_member_type_check;
  alter table trac_library.members
    add constraint members_member_type_check
    check (member_type in ('student', 'staff', 'community'));
exception
  when others then
    raise notice 'Could not apply members_member_type_check: %', sqlerrm;
end $$;

create unique index if not exists members_student_id_unique
  on trac_library.members (student_id)
  where student_id is not null and student_id <> '';

-- One patron per email address, compared case-insensitively to match the
-- app's lookups.
do $$
begin
  create unique index if not exists members_email_unique
    on trac_library.members (lower(email))
    where email <> '';
exception
  when others then
    raise notice 'Could not create members_email_unique (duplicate emails?): %', sqlerrm;
end $$;

create table if not exists trac_library.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references trac_library.books (id) on delete restrict,
  member_id uuid not null references trac_library.members (id) on delete restrict,
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  status text not null default 'active' check (status in ('active', 'returned', 'overdue'))
);

create table if not exists trac_library.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  related_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists loans_book_id_idx on trac_library.loans (book_id);
create index if not exists loans_member_id_idx on trac_library.loans (member_id);
create index if not exists loans_status_idx on trac_library.loans (status);
create index if not exists notifications_created_at_idx on trac_library.notifications (created_at desc);
create index if not exists notifications_read_idx on trac_library.notifications (read);

-- Hot-path indexes for the nightly sweep (D4): the overdue/due-soon range
-- scans filter on due_at of non-returned loans, and the 4-day cooldown check
-- looks up notifications by (type, related_id).
create index if not exists loans_due_at_idx on trac_library.loans (due_at) where status <> 'returned';
create index if not exists notifications_type_related_idx on trac_library.notifications (type, related_id, created_at desc);

-- The app's API routes talk to Supabase using the service role key
-- (see src/lib/supabase.ts), which bypasses Row Level Security. RLS can
-- stay disabled, or be enabled with policies of your choosing — it has
-- no effect on the service-role connection used server-side.

-- Force PostgREST to pick up the tables immediately. Without this, the
-- API can return "Could not find the table 'trac_library.users' in the schema
-- cache" for a minute or two after creating tables, even though they
-- exist — this makes the fix in this file take effect right away.
select pg_notify('pgrst', 'reload schema');

-- ── Loan capacity guard (D1) ─────────────────────────────────────────────
-- The app checks availability and the 3-loan cap before lending, but two
-- simultaneous checkouts of the last copy both pass that check. This
-- trigger is the database's final say: it locks the book and member rows
-- (serializing concurrent inserts) and refuses any loan that would push
-- active loans past total_copies or past 3 per member.
create or replace function trac_library.enforce_loan_capacity() returns trigger
language plpgsql
set search_path = trac_library
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

drop trigger if exists loans_capacity on trac_library.loans;
create trigger loans_capacity before insert on trac_library.loans
  for each row execute function trac_library.enforce_loan_capacity();

-- ── Transactional checkout (D1) ──────────────────────────────────────────
-- One transaction per checkout: atomic conditional decrement (immune to
-- stale reads), loan insert (trigger backstops capacity), and the
-- checked_out / low_stock notifications. Any failure rolls back everything
-- — the app no longer needs its manual compensation write.
create or replace function trac_library.checkout_loan(p_book_id uuid, p_member_id uuid, p_days integer)
returns trac_library.loans
language plpgsql
set search_path = trac_library
as $$
declare
  v_book trac_library.books%rowtype;
  v_member trac_library.members%rowtype;
  v_due timestamptz;
  v_loan trac_library.loans%rowtype;
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

-- ── Transactional return (D2) ────────────────────────────────────────────
-- One transaction: conditional update (WHERE status <> 'returned' — a
-- duplicate return is rejected instead of double-incrementing availability),
-- atomic capped increment (LEAST(total_copies, available_copies + 1)), and
-- the returned notification. Lock order book -> member matches checkout.
create or replace function trac_library.return_loan(p_loan_id uuid)
returns trac_library.loans
language plpgsql
set search_path = trac_library
as $$
declare
  v_loan trac_library.loans%rowtype;
  v_book trac_library.books%rowtype;
  v_member trac_library.members%rowtype;
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

-- ── Transactional renew (R2) ─────────────────────────────────────────────
-- One transaction: conditional update (WHERE status <> 'returned' — a renew
-- racing a return can no longer resurrect the loan), member.active check,
-- validated extra days, monotonic due date, and the renewed notification.
create or replace function trac_library.renew_loan(p_loan_id uuid, p_extra_days integer)
returns trac_library.loans
language plpgsql
set search_path = trac_library
as $$
declare
  v_loan trac_library.loans%rowtype;
  v_member trac_library.members%rowtype;
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

-- ── Transactional loan sweep (D3) ────────────────────────────────────────
-- One transaction: a transaction-scoped advisory lock serializes overlapping
-- runs; the stamp re-checks due_at (a renewed loan cannot be stamped); the
-- 4-day cooldown check and each notification insert share the transaction,
-- so duplicate alerts are impossible even if Vercel fires the cron twice.
create or replace function trac_library.sweep_loan_statuses()
returns table(ran_at timestamptz, marked_overdue integer, overdue_alerts integer, due_soon_alerts integer)
language plpgsql
set search_path = trac_library
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


-- ══════════════ KOHA-INSPIRED UPGRADE ══════════════

-- Koha-inspired schema upgrade — item-level records, holds, fines.
-- Ports the core of Koha's data model (biblio/items/issues/reserves/accountlines)
-- onto the existing Supabase tables without breaking anything:
--   books      ~ biblio        (catalog record)
--   book_items ~ items         (physical copy: barcode, branch/status)
--   loans      ~ issues        (checkout; now optionally tied to a specific item)
--   members    ~ borrowers     (patrons)
--   holds      ~ reserves      (reservations / holds queue)
--   fines      ~ accountlines  (patron accounting)
-- Idempotent; safe to re-run.

create extension if not exists pgcrypto;

-- ── Items (physical copies) — Koha `items` ────────────────────────────────
create table if not exists trac_library.book_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references trac_library.books (id) on delete cascade,
  barcode text not null,
  -- Koha authorized-value statuses
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
  create unique index if not exists book_items_barcode_unique on trac_library.book_items (barcode);
exception when others then raise notice 'book_items_barcode_unique: %', sqlerrm;
end $$;
create index if not exists book_items_book_idx on trac_library.book_items (book_id);
create index if not exists book_items_status_idx on trac_library.book_items (status);

-- Link existing loans to a specific physical copy (nullable for legacy rows).
alter table trac_library.loans add column if not exists item_id uuid
  references trac_library.book_items (id) on delete set null;

-- Renewal tracking (Koha `issues.renewals_count`).
alter table trac_library.loans add column if not exists renewals_count integer not null default 0;

-- Issuing staff member (Koha `issues.issuer_id`).
alter table trac_library.loans add column if not exists issued_by uuid
  references trac_library.users (id) on delete set null;

-- ── Holds / reservations — Koha `reserves` ────────────────────────────────
create table if not exists trac_library.holds (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references trac_library.books (id) on delete cascade,
  member_id uuid not null references trac_library.members (id) on delete cascade,
  -- null = next available copy; set = hold on a specific copy
  item_id uuid references trac_library.book_items (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'fulfilled', 'cancelled', 'expired')),
  priority integer not null default 1,
  pickup_branch text not null default 'MAIN',
  placed_at timestamptz not null default now(),
  expires_at timestamptz,
  fulfilled_loan_id uuid references trac_library.loans (id) on delete set null,
  cancelled_reason text
);

create index if not exists holds_book_queue_idx on trac_library.holds (book_id, priority)
  where status in ('pending', 'ready');
create index if not exists holds_member_idx on trac_library.holds (member_id);

-- One open hold per member per title (Koha enforces this too).
do $$ begin
  create unique index if not exists holds_one_open_per_member
    on trac_library.holds (book_id, member_id)
    where status in ('pending', 'ready');
exception when others then raise notice 'holds_one_open_per_member: %', sqlerrm;
end $$;

-- ── Fines & patron accounting — Koha `accountlines` ───────────────────────
create table if not exists trac_library.fines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references trac_library.members (id) on delete cascade,
  loan_id uuid references trac_library.loans (id) on delete set null,
  type text not null default 'overdue'
    check (type in ('overdue', 'lost', 'damaged', 'manual_invoice', 'credit', 'forgive')),
  amount numeric(10, 2) not null check (amount >= 0),
  amount_outstanding numeric(10, 2) not null check (amount_outstanding >= 0),
  description text,
  issued_by uuid references trac_library.users (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists fines_member_idx on trac_library.fines (member_id);
create index if not exists fines_open_idx on trac_library.fines (member_id)
  where paid_at is null and amount_outstanding > 0;

-- ── Circulation policy knobs (per member type, Koha issuingrules) ─────────
create table if not exists trac_library.circulation_rules (
  id uuid primary key default gen_random_uuid(),
  member_type text not null unique
    check (member_type in ('student', 'staff', 'community')),
  loan_days integer not null default 14,
  renewal_days integer not null default 7,
  max_renewals integer not null default 2,
  max_loans integer not null default 3,
  fine_per_day numeric(6, 2) not null default 0
);

insert into trac_library.circulation_rules (member_type, loan_days, renewal_days, max_renewals, max_loans, fine_per_day)
values
  ('student',   14, 7, 2, 3, 1.00),
  ('staff',     30, 14, 3, 10, 0),
  ('community', 14, 7, 1, 2, 1.00)
on conflict (member_type) do nothing;

-- ── Availability sync: keep books.available_copies true to item reality ───
create or replace function trac_library.sync_book_availability() returns trigger
language plpgsql as $$
begin
  update trac_library.books b
  set available_copies = greatest(
    total_copies - (
      (select count(*) from trac_library.book_items i
       where i.book_id = b.id and i.status in ('damaged','lost','withdrawn'))
      + (select count(*) from trac_library.loans l
         where l.book_id = b.id and l.returned_at is null)
    ), 0)
  where b.id = coalesce(new.book_id, old.book_id);
  return null;
end $$;

drop trigger if exists trg_book_items_sync_avail on trac_library.book_items;
create trigger trg_book_items_sync_avail
after insert or update or delete on trac_library.book_items
for each row execute function trac_library.sync_book_availability();

drop trigger if exists trg_loans_sync_avail on trac_library.loans;
create trigger trg_loans_sync_avail
after insert or update or delete on trac_library.loans
for each row execute function trac_library.sync_book_availability();

-- ══════════════ FINES ACCRUAL (added post-audit) ══════════════

-- ── Fines accrual (Koha-style): called by the nightly loan sweep ──────────
create or replace function trac_library.accrue_overdue_fines()
returns integer
language plpgsql
set search_path = trac_library
as $$
declare
  v_row record;
  v_count integer := 0;
  v_rate numeric;
  v_days integer;
  v_amount numeric;
begin
  for v_row in
    select l.id as loan_id, l.member_id, l.due_at, m.member_type
      from trac_library.loans l
      join trac_library.members m on m.id = l.member_id
     where l.returned_at is null
       and l.due_at < now()
       and not exists (
         select 1 from trac_library.fines f
          where f.loan_id = l.id and f.type = 'overdue'
       )
  loop
    select fine_per_day into v_rate
      from trac_library.circulation_rules
     where member_type = v_row.member_type;

    if v_rate is null or v_rate <= 0 then
      continue;
    end if;

    v_days := greatest(1, floor(extract(epoch from (now() - v_row.due_at)) / 86400)::int);
    v_amount := v_rate * v_days;

    insert into trac_library.fines
      (member_id, loan_id, type, amount, amount_outstanding, description)
    values
      (v_row.member_id, v_row.loan_id, 'overdue', v_amount, v_amount,
       'Overdue fine: ' || v_days || ' day(s) at ₱' || v_rate || '/day');

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Close out open overdue fines when the loan is returned (freeze the amount).
create or replace function trac_library.close_overdue_fine()
returns trigger
language plpgsql
set search_path = trac_library
as $$
begin
  update trac_library.fines
     set description = description || ' (loan returned; amount frozen)'
   where loan_id = new.id and type = 'overdue' and paid_at is null;
  return new;
end;
$$;

drop trigger if exists trg_close_fine on trac_library.loans;
create trigger trg_close_fine
after update of returned_at on trac_library.loans
for each row
when (new.returned_at is not null and old.returned_at is null)
execute function trac_library.close_overdue_fine();


-- ══════════════ SECURITY LOCKDOWN (audit fix) ══════════════
-- The app talks to the DB exclusively via the server-side service_role key
-- (which bypasses RLS). Browser keys must have NO direct table access.
revoke all on all tables in schema trac_library from anon, authenticated;
revoke all on all functions in schema trac_library from anon, authenticated;

alter table trac_library.users enable row level security;
alter table trac_library.members enable row level security;
alter table trac_library.loans enable row level security;
alter table trac_library.fines enable row level security;
alter table trac_library.holds enable row level security;
alter table trac_library.notifications enable row level security;
alter table trac_library.book_items enable row level security;
-- No policies created: RLS with zero policies = deny-all for non-service roles.
