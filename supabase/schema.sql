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
  role text not null default 'student' check (role in ('student', 'librarian', 'admin')),
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

-- The app's API routes talk to Supabase using the service role key
-- (see src/lib/supabase.ts), which bypasses Row Level Security. RLS can
-- stay disabled, or be enabled with policies of your choosing — it has
-- no effect on the service-role connection used server-side.

-- Force PostgREST to pick up the tables immediately. Without this, the
-- API can return "Could not find the table 'public.users' in the schema
-- cache" for a minute or two after creating tables, even though they
-- exist — this makes the fix in this file take effect right away.
select pg_notify('pgrst', 'reload schema');
