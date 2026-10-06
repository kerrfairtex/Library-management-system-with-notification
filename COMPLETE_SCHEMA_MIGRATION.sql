-- =============================================================================
-- COMPLETE TRAC LIBRARY SCHEMA — Run in Supabase SQL Editor
-- =============================================================================
-- Creates all tables in dependency order, then adds fixes
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. USERS TABLE (no dependencies)
-- =============================================================================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.users alter column role set default 'student';

do $$
begin
  alter table public.users drop constraint if exists users_role_check;
  alter table public.users add constraint users_role_check check (role in ('student', 'librarian', 'admin'));
exception when others then raise notice 'users_role_check: %', sqlerrm;
end $$;

do $$
begin
  alter table public.users add column if not exists status text;
exception when others then raise notice 'users.status: %', sqlerrm;
end $$;

update public.users set status = 'active' where status is null or status = '';

alter table public.users alter column status set default 'active';
alter table public.users alter column status set not null;

do $$
begin
  alter table public.users drop constraint if exists users_status_check;
  alter table public.users add constraint users_status_check check (status in ('pending', 'active'));
exception when others then raise notice 'users_status_check: %', sqlerrm;
end $$;

-- =============================================================================
-- 2. BOOKS TABLE (no dependencies)
-- =============================================================================
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

do $$ begin
  alter table public.books add column if not exists category text not null default 'General';
  alter table public.books add column if not exists shelf_location text;
  alter table public.books add column if not exists call_number text;
exception when others then raise notice 'books taxonomy: %', sqlerrm;
end $$;

create index if not exists books_category_idx on public.books (category);

do $$
begin
  alter table public.books drop constraint if exists books_total_copies_check;
  alter table public.books add constraint books_total_copies_check check (total_copies >= 0);
  alter table public.books drop constraint if exists books_available_copies_check;
  alter table public.books add constraint books_available_copies_check check (available_copies >= 0);
  alter table public.books drop constraint if exists books_available_within_total;
  alter table public.books add constraint books_available_within_total check (available_copies <= total_copies);
exception when others then raise notice 'books copy-count: %', sqlerrm;
end $$;

do $$
begin
  create unique index if not exists books_isbn_unique on public.books (isbn) where isbn <> '';
exception when others then raise notice 'books_isbn_unique: %', sqlerrm;
end $$;

-- =============================================================================
-- 3. MEMBERS TABLE (no dependencies)
-- =============================================================================
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  member_type text not null default 'student' check (member_type in ('student', 'staff', 'community')),
  student_id text,
  grade text,
  joined_at timestamptz not null default now(),
  active boolean not null default true
);

alter table public.members add column if not exists member_type text;
alter table public.members add column if not exists student_id text;
alter table public.members add column if not exists grade text;

update public.members set member_type = 'student' where member_type is null or member_type = '';

alter table public.members alter column member_type set default 'student';

do $$
begin
  alter table public.members alter column member_type set not null;
exception when others then raise notice 'members.member_type NOT NULL: %', sqlerrm;
end $$;

do $$
begin
  alter table public.members drop constraint if exists members_member_type_check;
  alter table public.members add constraint members_member_type_check check (member_type in ('student', 'staff', 'community'));
exception when others then raise notice 'members_member_type_check: %', sqlerrm;
end $$;

create unique index if not exists members_student_id_unique on public.members (student_id) where student_id is not null and student_id <> '';

do $$
begin
  create unique index if not exists members_email_unique on public.members (lower(email)) where email <> '';
exception when others then raise notice 'members_email_unique: %', sqlerrm;
end $$;

-- =============================================================================
-- 4. LOANS TABLE (depends on books, members)
-- =============================================================================
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  borrowed_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  status text not null default 'active' check (status in ('active', 'returned', 'overdue'))
);

-- =============================================================================
-- 5. NOTIFICATIONS TABLE (no dependencies)
-- =============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  related_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 6. HOLDS TABLE (depends on books, members, loans)
-- =============================================================================
create table if not exists public.holds (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null default 'hold' check (kind in ('hold', 'borrow_request')),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'fulfilled', 'cancelled', 'expired', 'rejected', 'approved')),
  priority integer not null default 1,
  pickup_branch text not null default 'MAIN',
  placed_at timestamptz not null default now(),
  expires_at timestamptz,
  fulfilled_loan_id uuid references public.loans (id) on delete set null,
  cancelled_reason text
);

create index if not exists holds_book_queue_idx on public.holds (book_id, priority) where status in ('pending', 'ready');
create index if not exists holds_member_idx on public.holds (member_id);

create unique index if not exists holds_one_open_per_member
  on public.holds (book_id, member_id)
  where status in ('pending', 'ready', 'approved');

-- Disable RLS (service-role bypasses; this allows API inserts)
alter table public.holds disable row level security;

-- =============================================================================
-- 7. FINES TABLE (depends on members, loans, users)
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
-- 8. SETTINGS TABLE (depends on users)
-- =============================================================================
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  category text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id)
);

insert into public.settings (key, value, description, category) values
  ('circulation.max_active_loans_per_member', '3', 'Maximum active loans per member', 'circulation'),
  ('circulation.loan_period_days', '14', 'Default loan period in days', 'circulation'),
  ('circulation.loan_period_options', '[7, 14, 21, 30]', 'Available loan period options (JSON array)', 'circulation'),
  ('circulation.max_loan_days', '60', 'Maximum loan period in days', 'circulation'),
  ('circulation.overdue_fine_per_day', '5', 'Overdue fine per day in pesos', 'circulation'),
  ('circulation.pickup_window_days', '3', 'Days to pick up approved borrow request', 'circulation'),
  ('circulation.overdue_alert_cooldown_days', '4', 'Days before duplicate overdue alerts', 'circulation'),
  ('circulation.due_soon_window_days', '3', 'Days before due date to send reminder', 'circulation'),
  ('circulation.max_renewal_days', '60', 'Maximum renewal period in days', 'circulation')
on conflict (key) do nothing;

-- Enable RLS for settings (admins only)
alter table public.settings enable row level security;

create policy "Admins can read settings"
  on public.settings for select
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can update settings"
  on public.settings for update
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can insert settings"
  on public.settings for insert
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
create index if not exists loans_book_id_idx on public.loans (book_id);
create index if not exists loans_member_id_idx on public.loans (member_id);
create index if not exists loans_status_idx on public.loans (status);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
create index if not exists notifications_read_idx on public.notifications (read);
create index if not exists loans_due_at_idx on public.loans (due_at) where status <> 'returned';
create index if not exists notifications_type_related_idx on public.notifications (type, related_id, created_at desc);

-- =============================================================================
-- LOAN CAPACITY TRIGGER (D1)
-- =============================================================================
create or replace function enforce_loan_capacity() returns trigger
language plpgsql set search_path = public as $$
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
-- CHECKOUT/RETURN/RENEW FUNCTIONS
-- =============================================================================
create or replace function checkout_loan(p_book_id uuid, p_member_id uuid, p_days integer)
returns loans language plpgsql set search_path = public as $$
declare
  v_book books%rowtype;
  v_member members%rowtype;
  v_due timestamptz;
  v_loan loans%rowtype;
begin
  if p_days is null or p_days < 1 or p_days > 60 then raise exception 'Loan period must be between 1 and 60 days.'; end if;
  select * into v_book from books where id = p_book_id for update;
  if not found then raise exception 'Book not found.'; end if;
  select * into v_member from members where id = p_member_id for update;
  if not found then raise exception 'Member not found.'; end if;
  if not v_member.active then raise exception 'Member is inactive.'; end if;
  update books set available_copies = available_copies - 1 where id = p_book_id and available_copies > 0 returning * into v_book;
  if not found then raise exception 'No copies available.'; end if;
  v_due := now() + make_interval(days => p_days);
  insert into loans (book_id, member_id, borrowed_at, due_at, returned_at, status)
  values (p_book_id, p_member_id, now(), v_due, null, 'active') returning * into v_loan;
  insert into notifications (type, title, message, related_id, read, created_at)
  values ('checked_out', 'Book checked out', v_member.name || ' checked out "' || v_book.title || '". Due ' || to_char(v_due, 'Mon DD, YYYY') || '.', v_loan.id, false, now());
  if v_book.available_copies = 0 then
    insert into notifications (type, title, message, related_id, read, created_at)
    values ('low_stock', 'No copies available', '"' || v_book.title || '" has 0 available copies.', p_book_id, false, now());
  end if;
  return v_loan;
end;
$$;

create or replace function return_loan(p_loan_id uuid)
returns loans language plpgsql set search_path = public as $$
declare
  v_loan loans%rowtype;
  v_book books%rowtype;
  v_member members%rowtype;
begin
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found.'; end if;
  if v_loan.status = 'returned' then raise exception 'Loan already returned.'; end if;
  select * into v_book from books where id = v_loan.book_id for update;
  select * into v_member from members where id = v_loan.member_id for update;
  update loans set status = 'returned', returned_at = coalesce(returned_at, now()) where id = p_loan_id and status <> 'returned' returning * into v_loan;
  if not found then raise exception 'Loan already returned.'; end if;
  update books set available_copies = least(total_copies, available_copies + 1) where id = v_book.id;
  insert into notifications (type, title, message, related_id, read, created_at)
  values ('returned', 'Book returned', v_member.name || ' returned "' || v_book.title || '".', v_loan.id::text, false, now());
  return v_loan;
end;
$$;

create or replace function renew_loan(p_loan_id uuid, p_extra_days integer)
returns loans language plpgsql set search_path = public as $$
declare
  v_loan loans%rowtype;
  v_member members%rowtype;
  v_due timestamptz;
begin
  if p_extra_days is null or p_extra_days < 1 or p_extra_days > 60 then raise exception 'Extra days must be between 1 and 60.'; end if;
  select * into v_loan from loans where id = p_loan_id for update;
  if not found then raise exception 'Loan not found.'; end if;
  if v_loan.status = 'returned' then raise exception 'Cannot renew a returned loan.'; end if;
  select * into v_member from members where id = v_loan.member_id for update;
  if not v_member.active then raise exception 'Member is inactive.'; end if;
  v_due := greatest(now(), v_loan.due_at) + make_interval(days => p_extra_days);
  update loans set due_at = v_due, status = 'active' where id = p_loan_id and status <> 'returned' returning * into v_loan;
  if not found then raise exception 'Cannot renew a returned loan.'; end if;
  insert into notifications (type, title, message, related_id, read, created_at)
  values ('renewed', 'Loan renewed', '"' || (select title from books where id = v_loan.book_id) || '" for ' || (select name from members where id = v_loan.member_id) || ' is now due ' || to_char(v_due, 'Mon DD, YYYY') || '.', v_loan.id::text, false, now());
  return v_loan;
end;
$$;

-- =============================================================================
-- LOAN SWEEP (D3)
-- =============================================================================
create or replace function sweep_loan_statuses()
returns table(ran_at timestamptz, marked_overdue integer, overdue_alerts integer, due_soon_alerts integer)
language plpgsql set search_path = public as $$
declare
  v_loan record;
  v_marked integer := 0;
  v_overdue_alerts integer := 0;
  v_due_soon_alerts integer := 0;
  v_days integer;
begin
  perform pg_advisory_xact_lock(hashtext('trac_loan_sweep'));
  update loans set status = 'overdue' where status <> 'returned' and due_at < now();
  get diagnostics v_marked = row_count;
  for v_loan in select l.id, l.due_at, b.title, m.name from loans l join books b on b.id = l.book_id join members m on m.id = l.member_id where l.status <> 'returned' and l.due_at < now() loop
    if not exists (select 1 from notifications where type = 'overdue' and related_id = v_loan.id::text and created_at > now() - interval '4 days') then
      v_days := greatest(1, floor(extract(epoch from (now() - v_loan.due_at)) / 86400)::int);
      insert into notifications (type, title, message, related_id, read, created_at)
      values ('overdue', 'Overdue loan', '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is ' || v_days || ' day' || case when v_days = 1 then '' else 's' end || ' overdue.', v_loan.id::text, false, now());
      v_overdue_alerts := v_overdue_alerts + 1;
    end if;
  end loop;
  for v_loan in select l.id, l.due_at, b.title, m.name from loans l join books b on b.id = l.book_id join members m on m.id = l.member_id where l.status <> 'returned' and l.due_at > now() and l.due_at <= now() + interval '3 days' loop
    if not exists (select 1 from notifications where type = 'due_soon' and related_id = v_loan.id::text and created_at > now() - interval '4 days') then
      insert into notifications (type, title, message, related_id, read, created_at)
      values ('due_soon', 'Due soon', '"' || v_loan.title || '" borrowed by ' || v_loan.name || ' is due soon.', v_loan.id::text, false, now());
      v_due_soon_alerts := v_due_soon_alerts + 1;
    end if;
  end loop;
  return query select now(), v_marked, v_overdue_alerts, v_due_soon_alerts;
end;
$$;

-- =============================================================================
-- FORCE POSTGREST SCHEMA RELOAD
-- =============================================================================
select pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- VERIFICATION QUERIES (run after to confirm)
-- =============================================================================
-- select table_name from information_schema.tables where table_schema = 'public' order by table_name;
-- select * from information_schema.columns where table_name = 'fines' order by ordinal_position;
-- select * from information_schema.columns where table_name = 'holds' order by ordinal_position;
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.holds'::regclass and contype = 'c';
-- select indexname, indexdef from pg_indexes where tablename = 'holds';
-- select rowlevelsecurity from pg_tables where tablename = 'holds';