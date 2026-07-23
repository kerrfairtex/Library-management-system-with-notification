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
  role text not null default 'librarian' check (role in ('librarian', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  isbn text not null,
  genre text not null,
  total_copies integer not null default 1,
  available_copies integer not null default 1,
  published_year integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  joined_at timestamptz not null default now(),
  active boolean not null default true
);

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
