-- TRAC Library: link each course/program to its owning department and
-- record its length in years.
-- IDEMPOTENT / ADDITIVE. NOT EXECUTED. Apply after 20261117_academic_user_management_up.sql.
--
-- department_id is nullable: a course with no department is offered across
-- departments (and every existing course starts that way). No mapping is
-- invented here — set it in the app (Administration → Departments & courses)
-- or with UPDATE statements once the official mapping is confirmed, e.g.
--   update public.courses set department_id =
--     (select id from public.departments where code = 'ICS')
--   where code in ('BSIT', 'BSIS');
-- Once a course has a department, the app refuses to put a student in that
-- course under any other department (src/lib/academic.ts).

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

-- Program length (years). Limits the year levels the forms and server accept
-- for that course: 4 → 1st-4th Year (+ Irregular, Graduate Student).
-- NULL = not set (1st-6th Year allowed).
alter table public.courses
  add column if not exists program_years smallint;

do $$
begin
  alter table public.courses
    add constraint courses_program_years_check
    check (program_years is null or program_years between 1 and 6);
exception when duplicate_object then null;
end $$;

-- Student ID Number is stored as text (leading zeros preserved) and is unique
-- across members (members_student_id_unique, created by 20261117).

-- Read-only check after mapping: students whose course belongs to a
-- different department than the one on their record (fix them in Patrons).
-- select m.id, m.name, m.student_id, d.code as member_dept, c.code as course, cd.code as course_dept
-- from public.members m
-- join public.courses c on c.id = m.course_id
-- join public.departments cd on cd.id = c.department_id
-- left join public.departments d on d.id = m.department_id
-- where m.member_type = 'student' and m.department_id is distinct from c.department_id;
