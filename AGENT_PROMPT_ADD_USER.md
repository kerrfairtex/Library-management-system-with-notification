# TASK: Finish "Add user": patron IDs, librarian patron creation, form polish, member filters

This is a **delta spec**. Most of the account-type + academic work is already shipped
(commits `64a6edb`, `24e1557`, migrations `20261117_academic_user_management`, `20261120_course_department`).
Build on the existing schema and helpers. **Do not** create parallel tables, columns, or validators.

## RULES
- Read `AGENTS.md`: this Next.js version has breaking changes; check `node_modules/next/dist/docs/` before writing route/page code.
- Small, focused commits, one per step below. After each step run:
  `npm run typecheck && npm run lint && npm test` (lint = 0 errors).
- No new dependencies. Keep error reports brief (what failed, file:line, fix).
- Mobile-first: the admin uses a phone. Native `<select>`, inline field errors, disable submit while busy, show API errors.
- Migrations: one idempotent `up` file plus a matching `_down` file in `supabase/migrations/`, following the
  existing `YYYYMMDD_name.sql` / `YYYYMMDD_name_down.sql` pattern. End `up` with `select pg_notify('pgrst','reload schema');`.

## ALREADY DONE (verify, don't rebuild)
- **Roles:** `UserRole` = student | faculty | teacher | community | librarian | admin (`src/lib/types.ts`).
  Patron roles share `patronCapabilities` (`src/lib/permissions.ts`). This 6-role model is final; do not revert to 3 roles.
- **Member types:** `member_type` follows the account role in `createStaff` (`src/lib/store.ts` ~L1033). User + member
  creation already rolls back the user if the member step fails.
- **Academic schema:** tables `departments`, `courses` (with `department_id`, program years). `members` has
  `department_id`, `course_id`, `year_level`, `section`, `student_id` (unique where not empty).
  The name is **courses**, not "programs".
- **Validation:** `src/lib/academic.ts` (`validateAcademicInput`, `missingAcademicFields`, `academicReferenceProblems`,
  `yearLevelsForProgram`, `YEAR_LEVELS`, `DEPARTMENT_MEMBER_TYPES`), tested in `academic.test.ts`.
  Account/role rules live in `src/lib/staff-rules.ts`. Extend these files; don't add `account-rules.ts`.
- **API:** `/api/academic` (GET/POST/PATCH), `/api/users` (admin-only via `requireAdmin`), `/api/members` (+`[id]`, `members.write`).
- **UI:** `staff/page.tsx` has per-role fields and blurbs plus `<AcademicSetup />` for admins.
  `components/AcademicFields.tsx` provides the cascading Department → Course → Year selects, also used by `members/page.tsx`.
- Seed data: departments/courses are entered by an admin in the app. **Do not seed** a department or course list.

## STEP 1: ID numbers for every patron type
Today only students store an ID (`student_id`; `createStaff` nulls it for other roles).
- Decision: **reuse `members.student_id` as the single ID column** (shown in the UI as "ID number"; label per type below).
  No new `id_number` column, no backfill. Record this decision in the migration header.
- Migration `YYYYMMDD_member_id_per_type.sql`: replace the global unique index `members_student_id_unique` with
  `create unique index ... on public.members (member_type, lower(btrim(student_id))) where student_id is not null and btrim(student_id) <> '';`
  Before dropping the old index, run a duplicate check query and `raise exception` with the offending values if the new index can't be built.
  The `_down` file restores the old index.
- Rules (in `academic.ts`, server-side, unit-tested):
  | Type | ID label | ID required | Department | Course / Year / Section |
  |---|---|---|---|---|
  | student | Student ID | yes | required | required (as today) |
  | faculty, teacher | Employee/Faculty ID | yes | optional (as today) | none |
  | community | ID presented (e.g. barangay/gov ID) | no | none | none |
  | librarian, admin | none (no member row) | | | |
- IDs: store as trimmed **text**. Never coerce to number; `"00125"` must stay `"00125"`. Duplicate → 409
  `"A <type> with this ID number already exists."` (update the current student-only message in `createStaff`).
- Wire through `createStaff`, `POST/PATCH /api/users`, `POST/PATCH /api/members`, and the Staff + Members forms.
  ID input: `inputMode="text"`, helper text "Enter the official ID exactly as issued", placeholder `2026-00125`.
  **Do not auto-generate IDs.**

## STEP 2: Librarians can create and edit patrons (not staff)
Today `/api/users` uses `requireAdmin`, the Staff page blocks non-admins, and librarians lack `members.write`.
- Add `members.write` to `librarian` in `permissions.ts`. Keep `staff.manage` admin-only.
- Add a rule in `staff-rules.ts`: a librarian may create or edit accounts whose role is a patron role
  (`PATRON_ROLES`) and may **not** create, edit, promote to, or demote from librarian/admin. Admin can do everything.
- `POST /api/users` and `PATCH /api/users/[id]`: replace `requireAdmin` with a capability check plus that rule
  (403 with a clear message). Role changes still go through `changeUserRoleAtomically`. Delete and reset password stay admin-only.
- Staff page: librarians see the page with only the patron account types in the dropdown and only patron rows editable.
  Hide (don't disable) admin-only actions and `<AcademicSetup />`. Update the subtitle/empty-state copy that says only admins can create accounts.
- Review every other `members.write` call site to make sure granting it to librarians doesn't expose anything unintended
  (e.g. member delete). List what you found in the final report.

## STEP 3: Account-type safety + form polish
- Block changing a patron's account type (role or member_type) while the member has open loans. Return 409
  "Return or transfer this member's N open loan(s) before changing their account type." Enforce in
  `changeUserRoleAtomically` / the members PATCH path, not only the UI.
- Staff form: add optional **Phone** (saved to `members.phone` for patrons). Replace the role blurbs with one short
  line per type. Make sure no "Read-only account…" copy remains.
- Password: keep "set password (≥ 8, `MIN_PASSWORD_LENGTH`)". Only add a "send reset link instead" option if
  `/api/auth/reset-password` can already send one by email; check first. If it can't, skip it and say so in the report.

## STEP 4: Find and export members
`members/page.tsx` filters only by member type and free text today; there is no CSV export anywhere.
- Add filters for department, course, year level, plus ID number in the text search. Course options follow the
  selected department via `coursesForDepartment`.
- Show department, course, year level and ID in the Members list/detail and on the Profile page.
- Add a "Download CSV" on Members (or Reports, pick one and say which) that exports the **filtered** list:
  name, email, phone, type, ID, department, course, year, section, active. Build it client-side (Blob); escape
  commas/quotes/newlines and prefix cells starting with `= + - @` to prevent CSV formula injection. Unit-test the CSV helper.

## TESTS (add to existing test files where they fit)
- ID rules per type: required/optional, trimmed, leading zeros kept, same ID allowed across different types,
  duplicate within a type → 409.
- Permissions: librarian can create/edit student, faculty, teacher, community; cannot create or edit librarian/admin
  or promote anyone to them; admin can do all.
- Type change blocked with open loans; allowed with none.
- CSV helper: escaping and formula-injection guard.

## DONE WHEN
typecheck, lint (0 errors), test and `npm run build` pass. The final report lists:
1. The migration file(s) to run in Supabase, in order, and the duplicate-ID check result.
2. The `members.write` call-site review from Step 2.
3. Whether the reset-link option was added or skipped.
4. Things the school must confirm: official ID formats per type, and whether teacher stays separate from faculty
   (a `teacher` circulation rule exists in `supabase/koha-upgrade.sql`, so don't merge them without asking).
