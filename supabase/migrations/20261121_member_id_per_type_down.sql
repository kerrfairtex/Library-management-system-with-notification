-- Reverts 20261121_member_id_per_type.sql.
-- Restores the global Student ID index. This fails if two members of
-- different types now share an ID; resolve those rows first:
--   select student_id, count(*) from public.members
--   where student_id is not null and student_id <> ''
--   group by student_id having count(*) > 1;
create unique index if not exists members_student_id_unique
  on public.members (student_id)
  where student_id is not null and student_id <> '';

drop index if exists public.members_type_id_number_unique;
