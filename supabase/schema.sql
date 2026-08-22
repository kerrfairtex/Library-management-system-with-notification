-- TRAC Library Management System — Supabase schema
--
-- Run this once in the Supabase SQL editor (or via `supabase db execute`)
-- before using the app. It creates the tables the app's data layer
-- (src/lib/store.ts) expects, using the same snake_case column names.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.users
  alter column role set default 'student';

do $$
begin
  alter table public.users
    drop constraint if exists users_role_check;
  alter table public.users
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
  alter table public.users add column if not exists status text;
exception
  when others then
    raise notice 'Could not add users.status: %', sqlerrm;
end $$;

update public.users set status = 'active' where status is null or status = '';

alter table public.users
  alter column status set default 'active';

do $$
begin
  alter table public.users alter column status set not null;
exception
  when others then
    raise notice 'Could not set users.status NOT NULL: %', sqlerrm;
end $$;

do $$
begin
  alter table public.users
    drop constraint if exists users_status_check;
  alter table public.users
    add constraint users_status_check
    check (status in ('pending', 'active'));
exception
  when others then
    raise notice 'Could not apply users_status_check: %', sqlerrm;
end $$;

create table if not exists public.books (
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

-- Copy-count guards. The app checks availability before lending, but two
-- simultaneous checkouts of the last copy would both pass that check, so the
-- database has the final say.
do $$
begin
  alter table public.books
    drop constraint if exists books_total_copies_check;
  alter table public.books
    add constraint books_total_copies_check check (total_copies >= 0);

  alter table public.books
    drop constraint if exists books_available_copies_check;
  alter table public.books
    add constraint books_available_copies_check check (available_copies >= 0);

  alter table public.books
    drop constraint if exists books_available_within_total;
  alter table public.books
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
    on public.books (isbn)
    where isbn <> '';
exception
  when others then
    raise notice 'Could not create books_isbn_unique (duplicate ISBNs?): %', sqlerrm;
end $$;

create table if not exists public.members (
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
alter table public.members add column if not exists member_type text;
alter table public.members add column if not exists student_id text;
alter table public.members add column if not exists grade text;

update public.members
set member_type = 'student'
where member_type is null or member_type = '';

alter table public.members
  alter column member_type set default 'student';

-- Backfill + constrain without failing on re-runs. Failures raise a notice
-- rather than passing silently, so a legacy row with a bad member_type is
-- visible in the SQL editor output instead of leaving the column unconstrained.
do $$
begin
  alter table public.members alter column member_type set not null;
exception
  when others then
    raise notice 'Could not set members.member_type NOT NULL: %', sqlerrm;
end $$;

do $$
begin
  alter table public.members
    drop constraint if exists members_member_type_check;
  alter table public.members
    add constraint members_member_type_check
    check (member_type in ('student', 'staff', 'community'));
exception
  when others then
    raise notice 'Could not apply members_member_type_check: %', sqlerrm;
end $$;

create unique index if not exists members_student_id_unique
  on public.members (student_id)
  where student_id is not null and student_id <> '';

-- One patron per email address, compared case-insensitively to match the
-- app's lookups.
do $$
begin
  create unique index if not exists members_email_unique
    on public.members (lower(email))
    where email <> '';
exception
  when others then
    raise notice 'Could not create members_email_unique (duplicate emails?): %', sqlerrm;
end $$;

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  status text not null default 'active' check (status in ('active', 'returned', 'overdue'))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  related_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists loans_book_id_idx on public.loans (book_id);
create index if not exists loans_member_id_idx on public.loans (member_id);
create index if not exists loans_status_idx on public.loans (status);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
create index if not exists notifications_read_idx on public.notifications (read);

-- Hot-path indexes for the nightly sweep (D4): the overdue/due-soon range
-- scans filter on due_at of non-returned loans, and the 4-day cooldown check
-- looks up notifications by (type, related_id).
create index if not exists loans_due_at_idx on public.loans (due_at) where status <> 'returned';
create index if not exists notifications_type_related_idx on public.notifications (type, related_id, created_at desc);

-- The app's API routes talk to Supabase using the service role key
-- (see src/lib/supabase.ts), which bypasses Row Level Security. RLS can
-- stay disabled, or be enabled with policies of your choosing — it has
-- no effect on the service-role connection used server-side.

-- Force PostgREST to pick up the tables immediately. Without this, the
-- API can return "Could not find the table 'public.users' in the schema
-- cache" for a minute or two after creating tables, even though they
-- exist — this makes the fix in this file take effect right away.
select pg_notify('pgrst', 'reload schema');

-- ── Loan capacity guard (D1) ─────────────────────────────────────────────
-- The app checks availability and the 3-loan cap before lending, but two
-- simultaneous checkouts of the last copy both pass that check. This
-- trigger is the database's final say: it locks the book and member rows
-- (serializing concurrent inserts) and refuses any loan that would push
-- active loans past total_copies or past 3 per member.
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

-- ── Transactional checkout (D1) ──────────────────────────────────────────
-- One transaction per checkout: atomic conditional decrement (immune to
-- stale reads), loan insert (trigger backstops capacity), and the
-- checked_out / low_stock notifications. Any failure rolls back everything
-- — the app no longer needs its manual compensation write.
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

-- ── Transactional return (D2) ────────────────────────────────────────────
-- One transaction: conditional update (WHERE status <> 'returned' — a
-- duplicate return is rejected instead of double-incrementing availability),
-- atomic capped increment (LEAST(total_copies, available_copies + 1)), and
-- the returned notification. Lock order book -> member matches checkout.
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

-- ── Transactional renew (R2) ─────────────────────────────────────────────
-- One transaction: conditional update (WHERE status <> 'returned' — a renew
-- racing a return can no longer resurrect the loan), member.active check,
-- validated extra days, monotonic due date, and the renewed notification.
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
