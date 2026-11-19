-- TRAC Library: SUGGESTED department → course catalog (OPTIONAL).
-- NOT EXECUTED. NOT the school's official list. Apply only if useful, after
-- migrations 20261117 and 20261120.
--
-- Safety:
--   * Every row is inserted INACTIVE, so nothing appears in the Add Student
--     form until an admin reactivates it (Administration → Departments &
--     courses) after confirming the school actually offers it.
--   * ON CONFLICT (code) DO NOTHING: existing departments/courses (e.g. the
--     supplied IAS / IUTES / ICS / ISCTS / IEDS and BSA, BSIT, BSIS, BSHM...)
--     are never modified. Map those to departments in the admin page.
--   * Program lengths are typical Philippine values (engineering 5 years,
--     others 4). Confirm per program.
--
-- Known code clashes with the supplied list — resolve before activating:
--   BSA  already exists (supplied list); here BS Accountancy is "BSAcc".
--   BS Industrial Technology uses "BSIndTech" (BSIT = Information Technology).
--   "BS Criminology" already exists; here it is "BSCRIM". Keep only one.

begin;

insert into public.departments (code, name, active) values
  ('CIT',    'College of Information Technology', false),
  ('CCS',    'College of Computer Studies', false),
  ('COE',    'College of Engineering', false),
  ('CBM',    'College of Business and Management', false),
  ('CACC',   'College of Accountancy', false),
  ('CED',    'College of Education', false),
  ('CAS',    'College of Arts and Sciences', false),
  ('CCJ',    'College of Criminal Justice', false),
  ('CHTM',   'College of Hospitality and Tourism Management', false),
  ('CAG',    'College of Agriculture', false),
  ('CNAHS',  'College of Nursing and Allied Health Sciences', false),
  ('CINDT',  'College of Industrial Technology', false),
  ('CARCH',  'College of Architecture', false),
  ('CMS',    'College of Maritime Studies', false),
  ('OTHER',  'Other / Not Applicable', false)
on conflict (code) do nothing;

insert into public.courses (code, name, active, department_id, program_years)
select v.code, v.name, false, d.id, v.years
from (values
  ('BSIT',      'BS Information Technology',          'CIT',   4),
  ('BSCS',      'BS Computer Science',                'CCS',   4),
  ('BSIS',      'BS Information Systems',             'CCS',   4),
  ('BSCpE',     'BS Computer Engineering',            'COE',   5),
  ('BSCE',      'BS Civil Engineering',               'COE',   5),
  ('BSEE',      'BS Electrical Engineering',          'COE',   5),
  ('BSME',      'BS Mechanical Engineering',          'COE',   5),
  ('BSAcc',     'BS Accountancy',                     'CACC',  4),
  ('BSBA',      'BS Business Administration',         'CBM',   4),
  ('BSEntrep',  'BS Entrepreneurship',                'CBM',   4),
  ('BSMA',      'BS Management Accounting',           'CACC',  4),
  ('BEEd',      'Bachelor of Elementary Education',   'CED',   4),
  ('BSEd',      'Bachelor of Secondary Education',    'CED',   4),
  ('BSCRIM',    'BS Criminology',                     'CCJ',   4),
  ('BSHM',      'BS Hospitality Management',          'CHTM',  4),
  ('BSTM',      'BS Tourism Management',              'CHTM',  4),
  ('BSAg',      'BS Agriculture',                     'CAG',   4),
  ('BSN',       'BS Nursing',                         'CNAHS', 4),
  ('BSPsych',   'BS Psychology',                      'CAS',   4),
  ('BSIndTech', 'BS Industrial Technology',           'CINDT', 4)
) as v(code, name, dept, years)
join public.departments d on d.code = v.dept
on conflict (code) do nothing;

commit;

-- Review (read-only):
-- select c.code, c.name, d.code as dept, c.program_years, c.active
-- from public.courses c left join public.departments d on d.id = c.department_id
-- order by d.code nulls first, c.code;
