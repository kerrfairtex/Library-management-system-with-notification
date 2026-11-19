-- TRAC Library: one ID number per patron type.
-- IDEMPOTENT. NOT EXECUTED. Apply after 20261120_course_department.sql.
--
-- Decision: members.student_id stays the single ID column for every patron
-- type (no new id_number column, no backfill). The app labels it per type:
--   student          → Student ID            (required)
--   faculty, teacher → Employee/Faculty ID   (required)
--   community        → ID presented          (optional)
--   staff            → none
-- IDs are trimmed text; "00125" stays "00125".
--
-- Uniqueness changes from "unique across all members" to "unique within a
-- member type, ignoring case and surrounding spaces", so a student and a
-- faculty member may both hold "00125". Mirrors idNumberKey() in
-- src/lib/academic.ts.

-- 1. Refuse to continue if the new index cannot be built.
do $$
declare
  v_dupes text;
begin
  select string_agg(format('%s "%s" (%s rows)', member_type, id_key, n), '; ')
    into v_dupes
  from (
    select member_type, lower(btrim(student_id)) as id_key, count(*) as n
    from public.members
    where student_id is not null and btrim(student_id) <> ''
    group by member_type, lower(btrim(student_id))
    having count(*) > 1
  ) d;
  if v_dupes is not null then
    raise exception 'Duplicate ID numbers within a member type; fix these first: %', v_dupes
      using errcode = '23505';
  end if;
end $$;

-- 2. Swap the global index for the per-type one.
create unique index if not exists members_type_id_number_unique
  on public.members (member_type, lower(btrim(student_id)))
  where student_id is not null and btrim(student_id) <> '';

drop index if exists public.members_student_id_unique;
