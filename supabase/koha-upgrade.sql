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
create table if not exists public.book_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
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
  create unique index if not exists book_items_barcode_unique on public.book_items (barcode);
exception when others then raise notice 'book_items_barcode_unique: %', sqlerrm;
end $$;
create index if not exists book_items_book_idx on public.book_items (book_id);
create index if not exists book_items_status_idx on public.book_items (status);

-- Link existing loans to a specific physical copy (nullable for legacy rows).
alter table public.loans add column if not exists item_id uuid
  references public.book_items (id) on delete set null;

-- Renewal tracking (Koha `issues.renewals_count`).
alter table public.loans add column if not exists renewals_count integer not null default 0;

-- Issuing staff member (Koha `issues.issuer_id`).
alter table public.loans add column if not exists issued_by uuid
  references public.users (id) on delete set null;

-- ── Holds / reservations — Koha `reserves` ────────────────────────────────
create table if not exists public.holds (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- null = next available copy; set = hold on a specific copy
  item_id uuid references public.book_items (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'fulfilled', 'cancelled', 'expired')),
  priority integer not null default 1,
  pickup_branch text not null default 'MAIN',
  placed_at timestamptz not null default now(),
  expires_at timestamptz,
  fulfilled_loan_id uuid references public.loans (id) on delete set null,
  cancelled_reason text
);

create index if not exists holds_book_queue_idx on public.holds (book_id, priority)
  where status in ('pending', 'ready');
create index if not exists holds_member_idx on public.holds (member_id);

-- One open hold per member per title (Koha enforces this too).
do $$ begin
  create unique index if not exists holds_one_open_per_member
    on public.holds (book_id, member_id)
    where status in ('pending', 'ready');
exception when others then raise notice 'holds_one_open_per_member: %', sqlerrm;
end $$;

-- ── Fines & patron accounting — Koha `accountlines` ───────────────────────
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

-- ── Circulation policy knobs (per member type, Koha issuingrules) ─────────
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

-- ── Availability sync: keep books.available_copies true to item reality ───
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
