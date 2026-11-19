-- TRAC Library: academic master data, user roles, student profiles.
-- IDEMPOTENT / ADDITIVE. Safe to re-run. DOES NOT touch production.
-- Apply only after reviewing existing rows; no existing records are rewritten.

-- ---------------------------------------------------------------------------
-- 1. Master tables (stable IDs + verified supplied values only)
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

-- Supplied handwritten list. Codes are kept verbatim; exact expanded names are
-- NOT invented. Administrator may confirm display names later via UPDATE.
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
-- 2. Six account roles. Legacy rows are preserved (no update of role values).
--    This constraint is REQUIRED. If it cannot be established, the whole
--    migration aborts — an incomplete schema is never acceptable.
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.users drop constraint if exists users_role_check;
  alter table public.users add constraint users_role_check
    check (role in ('student','faculty','teacher','community','librarian','admin'));
exception when others then
  -- Re-raise so the transaction fails loudly; no silent NOTICE fallback.
  raise exception 'Required users_role_check (six roles) could not be created: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Academic profile columns (nullable: legacy records stay valid).
--    No department/course mapping is invented.
-- ---------------------------------------------------------------------------
alter table public.members add column if not exists department_id uuid;
alter table public.members add column if not exists course_id uuid;
alter table public.members add column if not exists year_level text;
alter table public.members add column if not exists section text;

-- Historical records remain valid if a master row is later deactivated.
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

create index if not exists members_department_idx on public.members (department_id);
create index if not exists members_course_idx on public.members (course_id);
create index if not exists members_year_level_idx on public.members (year_level);
create index if not exists members_section_idx on public.members (section);

-- Unique Student ID already exists in schema.sql:179-181. Guard against a
-- deployment that never applied it (no data rewrite):
create unique index if not exists members_student_id_unique
  on public.members (student_id)
  where student_id is not null and student_id <> '';

-- ---------------------------------------------------------------------------
-- 4. Strict constraints are intentionally NOT added to existing rows.
--    A partial unique index protects NEW linked patron members:
-- ---------------------------------------------------------------------------
create unique index if not exists members_one_user_profile_per_user
  on public.members (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Database aggregation helpers (no full-table transfer to the browser).
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

-- Data API exposure: grant read to authenticated roles; service role is used
-- by the app. RLS stays enabled (deny-all for non-service roles by design).
grant usage on schema public to authenticated, anon;
grant select on public.departments, public.courses to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. POST-MIGRATION VERIFICATION (read-only; run manually after apply)
-- ---------------------------------------------------------------------------
-- (a) Constraint definition check — expected: exactly one row containing all
--     six roles in pg_get_constraintdef, and verified = true.
--
-- select
--   pg_get_constraintdef(oid) as definition,
--   (pg_get_constraintdef(oid) like '%student%' and
--    pg_get_constraintdef(oid) like '%faculty%' and
--    pg_get_constraintdef(oid) like '%teacher%' and
--    pg_get_constraintdef(oid) like '%community%' and
--    pg_get_constraintdef(oid) like '%librarian%' and
--    pg_get_constraintdef(oid) like '%admin%') as verified
-- from pg_constraint
-- where conrelid = 'public.users'::regclass and conname = 'users_role_check';
--
-- (b) Accepted-role check — all six INSERTs below must succeed; the seventh
--     (not_a_role) must fail with check constraint violation 23514. Run inside
--     a transaction that is ROLLED BACK; no rows are persisted:
--
-- begin;
--   insert into public.users (id,name,email,password_hash,role,status)
--   values (gen_random_uuid(),'R1','verify_roles_1@test.local','x','student','active'),
--          (gen_random_uuid(),'R2','verify_roles_2@test.local','x','faculty','active'),
--          (gen_random_uuid(),'R3','verify_roles_3@test.local','x','teacher','active'),
--          (gen_random_uuid(),'R4','verify_roles_4@test.local','x','community','active'),
--          (gen_random_uuid(),'R5','verify_roles_5@test.local','x','librarian','active'),
--          (gen_random_uuid(),'R6','verify_roles_6@test.local','x','admin','active');
-- rollback;
--
-- -- (b2) Invalid-role probe — MUST fail with SQLSTATE 23514 (check violation).
-- --     Kept in its own rolled-back transaction so the failure is isolated.
-- begin;
--   insert into public.users (id,name,email,password_hash,role,status)
--   values (gen_random_uuid(),'R7','verify_roles_7@test.local','x','not_a_role','active');
-- rollback;
-- -- Expected: ERROR: new row for relation "users" violates check constraint
-- -- "users_role_check"; SQL state: 23514. No rows are persisted.
--
-- (c) Duplicate linked member profiles (read-only; must return 0 rows BEFORE
--     the partial unique index members_one_user_profile_per_user is enforced):
--
-- select user_id, count(*) as profile_count,
--        array_agg(id order by joined_at) as member_ids
-- from public.members
-- where user_id is not null
-- group by user_id
-- having count(*) > 1
-- order by profile_count desc;
--
-- Review guidance: inspect each row manually. Do NOT auto-delete or auto-merge.
-- Administrators decide which profile is canonical; historical loans/fines must
-- be preserved. If duplicates exist, defer applying the unique index until
-- reconciled (remove that CREATE INDEX statement for a staged partial apply,
-- or run the migration only after review). No records are modified by this query.
