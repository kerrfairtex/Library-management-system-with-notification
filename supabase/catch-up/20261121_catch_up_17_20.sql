-- TRAC Library: catch-up for a database where 20261117 was only partly
-- applied and 20261120 was never applied (18, 19, 21 and 22 already are).
--
-- Creates ONLY the objects that were missing, copied from
-- migrations/20261117_academic_user_management_up.sql and
-- migrations/20261120_course_department.sql, in dependency order.
-- IDEMPOTENT: safe to run again; every step is IF NOT EXISTS,
-- CREATE OR REPLACE, ON CONFLICT DO NOTHING or a guarded DO block.
-- Runs as one transaction: any failure leaves the database unchanged.
--
-- Deliberately NOT touched:
--   * members_student_id_unique  (20261121 replaced it with the per-type
--     members_type_id_number_unique; recreating it would undo that)
--   * change_user_role           (owned by 20261122)
--   * users_role_check and members.department_id / course_id / year_level /
--     section (already present)
--
-- Check before and after with supabase/checks/migration-status.sql.

begin;

-- ---------------------------------------------------------------------------
-- 0. Prechecks. Abort with a clear message instead of failing half-way.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n bigint;
begin
  -- Columns this script relies on but does not create.
  select string_agg(c, ', ') into v_missing
  from unnest(array['user_id', 'member_type', 'student_id', 'department_id',
                    'course_id', 'year_level', 'section']) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = c);
  if v_missing is not null then
    raise exception 'Catch-up aborted: public.members is missing column(s): %. Apply the column part of 20261117 first.', v_missing;
  end if;

  -- members.department_id / course_id must be empty before their foreign keys
  -- exist: values written before the departments/courses tables existed
  -- cannot point at real rows. (Once the foreign key exists, values are
  -- validated by it, so a re-run does not trip this check.)
  if to_regclass('public.departments') is null
     or not exists (select 1 from pg_constraint where conname = 'members_department_fk'
                    and conrelid = 'public.members'::regclass) then
    select count(*) into v_n from public.members where department_id is not null;
    if v_n > 0 then
      raise exception 'Catch-up aborted: % member row(s) already have department_id set, but there is no departments table/foreign key to check them against. Review them (select id, name, department_id from public.members where department_id is not null) and clear or map them first.', v_n;
    end if;
  end if;

  if to_regclass('public.courses') is null
     or not exists (select 1 from pg_constraint where conname = 'members_course_fk'
                    and conrelid = 'public.members'::regclass) then
    select count(*) into v_n from public.members where course_id is not null;
    if v_n > 0 then
      raise exception 'Catch-up aborted: % member row(s) already have course_id set, but there is no courses table/foreign key to check them against. Review them (select id, name, course_id from public.members where course_id is not null) and clear or map them first.', v_n;
    end if;
  end if;

  -- members_one_user_profile_per_user needs at most one member per account.
  select count(*) into v_n from (
    select user_id from public.members
    where user_id is not null
    group by user_id having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception 'Catch-up aborted: % account(s) are linked to more than one member row. Find them with: select user_id, count(*) from public.members where user_id is not null group by user_id having count(*) > 1', v_n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Master tables (20261117 §1).
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed codes verbatim, as 20261117 does. Existing codes are left alone.
insert into public.departments (code, name) values
  ('IAS', 'IAS'), ('IUTES', 'IUTES'), ('ICS', 'ICS'),
  ('ISCTS', 'ISCTS'), ('IEDS', 'IEDS')
on conflict (code) do nothing;

insert into public.courses (code, name) values
  ('BSA', 'BSA'), ('BSAB', 'BSAB'), ('BSF', 'BSF'), ('BSIT', 'BSIT'),
  ('BSIS', 'BSIS'), ('BSW', 'BSW'), ('BFLD', 'BFLD'), ('BTVTED', 'BTVTED'),
  ('BSHM', 'BSHM'), ('BS Criminology', 'BS Criminology')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Course → department and program length (all of 20261120).
-- ---------------------------------------------------------------------------
alter table public.courses
  add column if not exists department_id uuid;

do $$
begin
  alter table public.courses
    add constraint courses_department_fk
    foreign key (department_id) references public.departments(id)
    on update cascade on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists courses_department_idx on public.courses (department_id);

alter table public.courses
  add column if not exists program_years smallint;

do $$
begin
  alter table public.courses
    add constraint courses_program_years_check
    check (program_years is null or program_years between 1 and 6);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Member → department/course foreign keys (20261117 §3).
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.members
    add constraint members_department_fk
    foreign key (department_id) references public.departments(id)
    on update cascade on delete set null;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.members
    add constraint members_course_fk
    foreign key (course_id) references public.courses(id)
    on update cascade on delete set null;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes (20261117 §3–4). members_student_id_unique is intentionally
--    omitted: 20261121 replaced it.
-- ---------------------------------------------------------------------------
create index if not exists members_department_idx on public.members (department_id);
create index if not exists members_course_idx on public.members (course_id);
create index if not exists members_year_level_idx on public.members (year_level);
create index if not exists members_section_idx on public.members (section);

create unique index if not exists members_one_user_profile_per_user
  on public.members (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Aggregation helpers (20261117 §5, unchanged).
-- ---------------------------------------------------------------------------
create or replace function public.count_incomplete_student_profiles()
returns bigint language sql stable as $$
  select count(*)::bigint from public.members m
  where m.member_type = 'student'
    and (m.student_id is null or btrim(m.student_id) = ''
      or m.department_id is null or m.course_id is null
      or m.year_level is null or btrim(m.year_level) = ''
      or m.section is null or btrim(m.section) = '');
$$;

create or replace function public.filtered_user_statistics(
  p_role text default null,
  p_status text default null,
  p_department text default null,
  p_course text default null,
  p_year_level text default null,
  p_section text default null
)
returns jsonb language sql stable as $$
  with filtered_members as (
    select m.user_id from public.members m
    where (p_department is null or m.department_id::text = p_department)
      and (p_course is null or m.course_id::text = p_course)
      and (p_year_level is null or m.year_level = p_year_level)
      and (p_section is null or m.section = p_section)
  ),
  cohort as (
    select u.role, u.status from public.users u
    where (p_role is null or u.role = p_role)
      and (p_status is null or u.status = p_status)
      and (
        p_department is null and p_course is null and
        p_year_level is null and p_section is null
        or exists (select 1 from filtered_members fm where fm.user_id = u.id)
      )
  )
  select jsonb_build_object(
    'totalAccounts', count(*),
    'activeAccounts', count(*) filter (where status = 'active'),
    'pendingAccounts', count(*) filter (where status = 'pending'),
    'students', count(*) filter (where role = 'student'),
    'faculty', count(*) filter (where role = 'faculty'),
    'teachers', count(*) filter (where role = 'teacher'),
    'community', count(*) filter (where role = 'community'),
    'librarians', count(*) filter (where role = 'librarian'),
    'admins', count(*) filter (where role = 'admin'),
    'totalMemberProfiles', (select count(*) from public.members),
    'incompleteStudentProfiles', public.count_incomplete_student_profiles()
  ) from cohort;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants (20261117 §5). GRANT is idempotent.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;
grant select on public.departments, public.courses to authenticated, anon;

commit;
