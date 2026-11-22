-- =============================================================================
-- CRITICAL FIX: Run this in Supabase Dashboard → SQL Editor
-- =============================================================================
-- This extracts the essential fixes from koha-upgrade.sql that unblock:
-- 1. Borrow request flow (holds table RLS + kind column + status constraint)
-- 2. Fines API (fines table missing)
-- 3. Holds status 'approved' constraint violation
-- =============================================================================

-- 1. CREATE FINES TABLE (required for /api/fines - 5 API routes)
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

-- 2. ADD HOLDS.KIND COLUMN (distinguishes 'hold' vs 'borrow_request')
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

-- 3. FIX HOLDS.STATUS CHECK CONSTRAINT TO INCLUDE 'APPROVED'
-- =============================================================================
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

-- 4. FIX HOLDS UNIQUE INDEX TO INCLUDE 'APPROVED'
-- =============================================================================
drop index if exists holds_one_open_per_member;
create unique index if not exists holds_one_open_per_member
  on public.holds (book_id, member_id)
  where status in ('pending', 'ready', 'approved');

-- 5. FIX HOLDS RLS - DISABLE OR ADD PROPER POLICIES
-- =============================================================================
-- Option A: Disable RLS (simpler, service-role bypasses anyway)
alter table public.holds disable row level security;

-- Option B: If you prefer RLS enabled, uncomment below and comment Option A:
-- alter table public.holds enable row level security;
-- create policy "Service role full access" on public.holds for all using (true);

-- 6. FORCE POSTGREST SCHEMA RELOAD
-- =============================================================================
select pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- VERIFICATION QUERIES (run after above to confirm)
-- =============================================================================
-- select * from information_schema.columns where table_name = 'fines';
-- select * from information_schema.columns where table_name = 'holds' and column_name = 'kind';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.holds'::regclass and contype = 'c';
-- select indexname, indexdef from pg_indexes where tablename = 'holds';
-- select rowlevelsecurity from pg_tables where tablename = 'holds';
-- =============================================================================