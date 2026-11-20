-- TRAC Library: access hardening for the public read paths.
-- IDEMPOTENT: safe to run again. Runs as one transaction.
-- Apply after supabase/catch-up/20261121_catch_up_17_20.sql (needs the
-- departments and courses tables). Recorded in docs/migrations-applied.md.
--
-- The app itself reads and writes these tables with the service-role key
-- (src/lib/supabase.ts), which bypasses RLS and these grants. What changes
-- here is only what the publishable/anon key (and `authenticated`) can do.

begin;

-- ---------------------------------------------------------------------------
-- 1. departments and courses: RLS on, anyone may read, nobody but the
--    service role may change them.
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.courses enable row level security;

-- Drop-and-create keeps the definition exact on every run.
drop policy if exists "public read" on public.departments;
create policy "public read" on public.departments
  for select to anon, authenticated
  using (true);

drop policy if exists "public read" on public.courses;
create policy "public read" on public.courses
  for select to anon, authenticated
  using (true);

-- Read stays granted (as 20261117 does); every write privilege goes.
grant select on public.departments, public.courses to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.departments, public.courses
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. book_items: the public catalog may read every column EXCEPT notes
--    (staff-only remarks; the app strips them for non-staff too, see
--    src/lib/book-items.ts).
--
--    The column list is built when this runs, so it covers every column the
--    table has now. A column ADDED LATER gets no grant: if the public
--    catalog should read it, grant it explicitly, e.g.
--      grant select (new_column) on public.book_items to anon, authenticated;
-- ---------------------------------------------------------------------------
revoke select on public.book_items from anon, authenticated;
-- A table-level REVOKE leaves column-level grants alone, so remove any
-- earlier column grant on notes explicitly.
revoke select (notes) on public.book_items from anon, authenticated;

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'book_items'
    and column_name <> 'notes';

  if v_cols is null then
    raise exception 'Hardening aborted: public.book_items not found.';
  end if;

  execute format('grant select (%s) on public.book_items to anon, authenticated', v_cols);
end $$;

commit;
