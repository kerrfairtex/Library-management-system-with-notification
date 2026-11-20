-- TRAC Library: top each of the 30 3D-shelf titles up to 100 physical copies.
-- IDEMPOTENT: a second run inserts nothing. One transaction: any failure
-- leaves the database unchanged. NOT run by the app; apply it yourself in the
-- Supabase SQL editor, AFTER the Catalog copies paging fix is deployed (the
-- old staff Catalog page fetched every copy and would silently stop at
-- 1,000 rows).
--
-- How totals move: the live trigger trg_book_items_sync_avail
-- (sync_book_availability_from_items) recomputes books on every book_items
-- insert:
--   total_copies     = copies with status available, on_loan, damaged, lost
--                      or withdrawn
--   available_copies = copies with status available
-- So this script only inserts rows; it never writes books.total_copies or
-- available_copies itself. Copies with status not_for_loan or in_transit are
-- not counted by that trigger, so they are not counted here either.
--
-- What it inserts, per title: (100 - counted copies) new rows with
--   barcode  SAMPLE-CP-<isbn without SAMPLE->-NNN   e.g. SAMPLE-CP-DEPED-001-042
--   status   available
--   notes    NULL (empty)
--   call_number / shelf_location copied from the title (books row)
--   home_branch / holding_branch MAIN
-- Existing copies are never changed. The 4 test titles (TEST-ADMIN-001,
-- TEST-Librarian-librarian, TEST-CSRF-001, 9781234567890) are not touched.
-- No new columns, so no new grants are needed: the hardening script's
-- column-level SELECT grant on book_items already covers every column used.
--
-- ROLLBACK (removes only the copies this script added; run as one block):
--   begin;
--   delete from public.book_items
--    where barcode like 'SAMPLE-CP-%'
--      and status = 'available'
--      and id not in (select item_id from public.loans where item_id is not null);
--   -- The trigger recomputes titles that still have copy rows. A title left
--   -- with none keeps total_copies = 100, so put those back to 10 (their
--   -- value before this seed), less their active loans:
--   update public.books b
--      set total_copies = 10,
--          available_copies = greatest(10 - (select count(*) from public.loans l
--                                            where l.book_id = b.id and l.returned_at is null), 0)
--    where b.isbn like 'SAMPLE-%'
--      and b.total_copies = 100
--      and not exists (select 1 from public.book_items i where i.book_id = b.id);
--   commit;
-- Copies already lent out (status on_loan) are kept; delete them after return.

begin;

create temporary table shelf_titles (isbn text primary key) on commit drop;
insert into shelf_titles (isbn) values
  ('SAMPLE-AGR-001'), ('SAMPLE-AGR-002'), ('SAMPLE-AGR-003'), ('SAMPLE-AGR-004'),
  ('SAMPLE-CHED-001'), ('SAMPLE-CHED-002'), ('SAMPLE-CHED-003'), ('SAMPLE-CHED-004'),
  ('SAMPLE-CHED-005'), ('SAMPLE-CHED-006'), ('SAMPLE-CHED-007'), ('SAMPLE-CHED-008'),
  ('SAMPLE-CHED-009'), ('SAMPLE-CHED-010'),
  ('SAMPLE-DEPED-001'), ('SAMPLE-DEPED-002'), ('SAMPLE-DEPED-003'), ('SAMPLE-DEPED-004'),
  ('SAMPLE-DEPED-005'), ('SAMPLE-DEPED-006'), ('SAMPLE-DEPED-007'), ('SAMPLE-DEPED-008'),
  ('SAMPLE-DEPED-009'), ('SAMPLE-DEPED-010'), ('SAMPLE-DEPED-011'),
  ('SAMPLE-ENG-001'),
  ('SAMPLE-LIT-001'), ('SAMPLE-LIT-002'), ('SAMPLE-LIT-003'),
  ('SAMPLE-REF-001');

-- ---------------------------------------------------------------------------
-- 0. Prechecks: abort with a clear message instead of inserting half-way.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_dupes text;
  v_over text;
begin
  if (select count(*) from shelf_titles) <> 30 then
    raise exception 'Seed aborted: expected 30 shelf ISBNs, found %.', (select count(*) from shelf_titles);
  end if;

  select string_agg(s.isbn, ', ' order by s.isbn) into v_missing
  from shelf_titles s
  where not exists (select 1 from public.books b where b.isbn = s.isbn);
  if v_missing is not null then
    raise exception 'Seed aborted: these shelf titles are not in public.books: %', v_missing;
  end if;

  select string_agg(isbn, ', ' order by isbn) into v_dupes from (
    select b.isbn from public.books b join shelf_titles s using (isbn)
    group by b.isbn having count(*) > 1
  ) d;
  if v_dupes is not null then
    raise exception 'Seed aborted: more than one books row for ISBN(s): %', v_dupes;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'loans' and column_name = 'item_id'
  ) then
    raise exception 'Seed aborted: public.loans.item_id is missing (koha-upgrade.sql adds it).';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.book_items'::regclass
      and tgname = 'trg_book_items_sync_avail' and not tgisinternal
  ) then
    raise exception 'Seed aborted: trigger trg_book_items_sync_avail is missing, so books.total_copies would not follow the new copies.';
  end if;

  select string_agg(format('%s (%s)', isbn, n), ', ') into v_over from (
    select b.isbn, count(i.id) as n
    from public.books b join shelf_titles s using (isbn)
    join public.book_items i on i.book_id = b.id
     and i.status in ('available', 'on_loan', 'damaged', 'lost', 'withdrawn')
    group by b.isbn having count(i.id) > 100
  ) o;
  if v_over is not null then
    raise notice 'Already above 100 counted copies, left as is: %', v_over;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Insert the missing copies. Candidate barcodes NNN = 001..200; any that
--    already exist are skipped, and only (100 - counted) are taken per title.
--    ON CONFLICT is a second guard against a barcode taken concurrently.
-- ---------------------------------------------------------------------------
with titles as (
  select b.id as book_id, b.isbn, b.call_number, b.shelf_location,
         greatest(100 - (
           select count(*) from public.book_items i
           where i.book_id = b.id
             and i.status in ('available', 'on_loan', 'damaged', 'lost', 'withdrawn')
         ), 0) as need
  from public.books b
  join shelf_titles s using (isbn)
),
candidates as (
  select t.book_id, t.call_number, t.shelf_location, t.need,
         'SAMPLE-CP-' || regexp_replace(t.isbn, '^SAMPLE-', '') || '-' || lpad(n::text, 3, '0') as barcode,
         n
  from titles t
  cross join generate_series(1, 200) as n
  where t.need > 0
),
free as (
  select c.*, row_number() over (partition by c.book_id order by c.n) as pick
  from candidates c
  where not exists (select 1 from public.book_items i where i.barcode = c.barcode)
)
insert into public.book_items
  (id, book_id, barcode, status, call_number, shelf_location,
   home_branch, holding_branch, notes, created_at)
select gen_random_uuid(), f.book_id, f.barcode, 'available', f.call_number, f.shelf_location,
       'MAIN', 'MAIN', null, now()
from free f
where f.pick <= f.need
on conflict (barcode) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Guard: every shelf title must now have total_copies = 100 (the trigger
--    sets it from the rows). Anything else rolls the whole seed back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s total=%s', b.isbn, b.total_copies), ', ' order by b.isbn) into v_bad
  from public.books b join shelf_titles s using (isbn)
  where b.total_copies <> 100;
  if v_bad is not null then
    raise exception 'Seed rolled back: total_copies is not 100 for: %', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Proof, one row per shelf title. result = 'ok' when total = available =
--    100. A title with copies out shows available < 100 and says why:
--      copies_on_loan       copy rows with status on_loan
--      loans_without_copy   active loans with no copy attached (older loans;
--                           the trigger cannot see them, so available may
--                           read higher than the books actually on the shelf)
-- ---------------------------------------------------------------------------
select * from (
select b.isbn,
       b.total_copies,
       b.available_copies,
       (select count(*) from public.book_items i where i.book_id = b.id)                      as copy_rows,
       (select count(*) from public.book_items i
         where i.book_id = b.id and i.barcode like 'SAMPLE-CP-%')                             as seeded_rows,
       (select count(*) from public.book_items i
         where i.book_id = b.id and i.status = 'on_loan')                                     as copies_on_loan,
       (select count(*) from public.loans l
         where l.book_id = b.id and l.returned_at is null and l.item_id is null)              as loans_without_copy,
       case
         when b.total_copies <> 100 then 'TOTAL NOT 100'
         when exists (select 1 from public.loans l
                       where l.book_id = b.id and l.returned_at is null and l.item_id is null)
           then 'CHECK: available overstated by loans_without_copy'
         when b.available_copies = 100 then 'ok'
         else 'available < 100: copies on loan (see copies_on_loan)'
       end                                                                                     as result
from public.books b
join shelf_titles s using (isbn)
) proof
order by result = 'ok', isbn;

commit;
