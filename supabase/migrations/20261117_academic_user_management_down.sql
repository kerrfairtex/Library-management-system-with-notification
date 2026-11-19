-- Rollback for 20261117_academic_user_management_up.sql
-- Non-destructive: removes only objects created by the up migration.
-- Existing rows and columns are preserved (no data deletion, no column drop).

drop function if exists public.filtered_user_statistics(text,text,text,text,text,text);
drop function if exists public.count_incomplete_student_profiles();

drop index if exists public.members_one_user_profile_per_user;
-- members_student_id_unique also exists in the baseline schema.sql:179-181.
-- Only drop it if this migration created it; on a standard deployment it did
-- NOT (IF NOT EXISTS was a no-op), so keep it. Uncomment only if you verified
-- the index was absent before applying the up migration:
-- drop index if exists public.members_student_id_unique;
drop index if exists public.members_section_idx;
drop index if exists public.members_year_level_idx;
drop index if exists public.members_course_idx;
drop index if exists public.members_department_idx;

-- FKs must be dropped BEFORE the master tables they reference, otherwise
-- DROP TABLE fails with "cannot drop table ... because other objects depend".
-- Column VALUES are preserved (no ALTER TABLE DROP COLUMN): academic reference
-- IDs remain as plain UUID text until an administrator reconciles them.
alter table public.members drop constraint if exists members_department_fk;
alter table public.members drop constraint if exists members_course_fk;
--
-- Column values are PRESERVED. Dropping columns would destroy legacy data.
-- The role CHECK is restored to the original three roles only if no rows use
-- the new roles (verify first with a SELECT; never run blindly):
-- alter table public.users drop constraint if exists users_role_check;
-- alter table public.users add constraint users_role_check
--   check (role in ('student','librarian','admin'));

drop table if exists public.courses;
drop table if exists public.departments;
