-- Reverts 20261120_course_department.sql.
alter table public.courses drop constraint if exists courses_program_years_check;
alter table public.courses drop column if exists program_years;
drop index if exists public.courses_department_idx;
alter table public.courses drop constraint if exists courses_department_fk;
alter table public.courses drop column if exists department_id;
