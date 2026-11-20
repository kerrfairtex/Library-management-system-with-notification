-- Read-only: reports which objects from supabase/migrations exist.
-- Uses only catalog lookups; changes nothing.
with expected(migration, kind, tbl, name, want) as (values
  -- Prerequisite: no file in the repo creates it, but 20261117/18/22 and the app use it.
  ('0-prereq', 'column',     'members',       'user_id',                            true),
  -- 20261117_academic_user_management_up.sql
  ('20261117', 'table',      null,            'departments',                        true),
  ('20261117', 'column',     'departments',   'active',                             true),
  ('20261117', 'table',      null,            'courses',                            true),
  ('20261117', 'column',     'courses',       'active',                             true),
  ('20261117', 'constraint', 'users',         'users_role_check',                   true),
  ('20261117', 'column',     'members',       'department_id',                      true),
  ('20261117', 'column',     'members',       'course_id',                          true),
  ('20261117', 'column',     'members',       'year_level',                         true),
  ('20261117', 'column',     'members',       'section',                            true),
  ('20261117', 'constraint', 'members',       'members_department_fk',              true),
  ('20261117', 'constraint', 'members',       'members_course_fk',                  true),
  ('20261117', 'index',      'members',       'members_department_idx',             true),
  ('20261117', 'index',      'members',       'members_course_idx',                 true),
  ('20261117', 'index',      'members',       'members_year_level_idx',             true),
  ('20261117', 'index',      'members',       'members_section_idx',                true),
  ('20261117', 'index',      'members',       'members_one_user_profile_per_user',  true),
  -- 20261117 creates this; 20261121 drops it. It must be ABSENT now.
  ('20261117', 'index',      'members',       'members_student_id_unique',          false),
  ('20261117', 'function',   null,            'count_incomplete_student_profiles()', true),
  ('20261117', 'function',   null,            'filtered_user_statistics(text,text,text,text,text,text)', true),
  -- 20261118_admin_protection_atomic.sql
  ('20261118', 'function',   null,            'lock_admin_invariant()',             true),
  ('20261118', 'function',   null,            'change_user_status(uuid,text,uuid)', true),
  ('20261118', 'function',   null,            'delete_user_guarded(uuid,uuid)',     true),
  ('20261118', 'function',   null,            'approve_student_account(uuid,uuid)', true),
  -- 20261118 creates this 3-arg version; 20261122 drops it. Must be ABSENT.
  ('20261118', 'function',   null,            'change_user_role(uuid,text,uuid)',   false),
  -- 20261119_notification_email.sql
  ('20261119', 'column',     'notifications', 'emailed_at',                         true),
  ('20261119', 'index',      'notifications', 'notifications_email_pending_idx',    true),
  -- 20261120_course_department.sql
  ('20261120', 'column',     'courses',       'department_id',                      true),
  ('20261120', 'column',     'courses',       'program_years',                      true),
  ('20261120', 'constraint', 'courses',       'courses_department_fk',              true),
  ('20261120', 'constraint', 'courses',       'courses_program_years_check',        true),
  ('20261120', 'index',      'courses',       'courses_department_idx',             true),
  -- 20261121_member_id_per_type.sql
  ('20261121', 'index',      'members',       'members_type_id_number_unique',      true),
  -- 20261122_role_change_keeps_id.sql
  ('20261122', 'function',   null,            'change_user_role(uuid,text,uuid,text)', true)
),
checked as (
  select e.*,
    case e.kind
      when 'table'    then to_regclass('public.' || e.name) is not null
      when 'index'    then to_regclass('public.' || e.name) is not null
      when 'function' then to_regprocedure('public.' || e.name) is not null
      when 'column'   then exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = e.tbl and c.column_name = e.name)
      when 'constraint' then exists (
        select 1 from pg_constraint k
        where k.conname = e.name and k.conrelid = to_regclass('public.' || e.tbl))
    end as present
  from expected e
)
select migration,
       kind,
       coalesce(tbl || '.', '') || name                       as object,
       case when want then 'should exist' else 'should be absent' end as expected,
       present,
       case when present = want then 'ok' else 'MISMATCH' end as status,
       null::text                                              as detail
from checked

union all
-- Every change_user_role overload actually installed (expect exactly one, 4 args).
select '20261118/22', 'overload', p.oid::regprocedure::text, 'exactly one, 4 args',
       true, case when p.pronargs = 4 then 'ok' else 'MISMATCH' end, null
from pg_proc p
where p.proname = 'change_user_role' and p.pronamespace = 'public'::regnamespace

union all
-- Seed rows from 20261117 (only meaningful when the tables exist).
select '20261117', 'rows', 'departments / courses', 'seeded',
       to_regclass('public.departments') is not null,
       case when to_regclass('public.departments') is null then 'MISMATCH' else 'info' end,
       case when to_regclass('public.departments') is null then 'tables missing'
            else (xpath('/row/n/text()', query_to_xml(
                   'select (select count(*) from public.departments) || '' departments, '' ||
                           (select count(*) from public.courses) || '' courses'' as n',
                   false, true, '')))[1]::text end

union all
-- IDs shared across member types: legal since 20261121, but they would make
-- 20261117's global members_student_id_unique index fail if 20261117 is run.
select '20261117', 'precheck', 'student_id shared across member types', '0 before running 20261117',
       true,
       case when n = 0 then 'ok' else 'BLOCKS 20261117' end,
       n || ' shared ID(s)'
from (
  select count(*) as n from (
    select lower(btrim(student_id))
    from public.members
    where student_id is not null and btrim(student_id) <> ''
    group by 1
    having count(distinct member_type) > 1
  ) d
) s

order by 1, 2, 3;
