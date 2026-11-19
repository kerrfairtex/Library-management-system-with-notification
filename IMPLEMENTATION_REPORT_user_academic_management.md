# TRAC Library — User Management & Academic Structure Implementation Report

Branch: feature/complete-user-academic-management (created from 64a6edb)
Mode: Inspect -> Verify -> Plan -> Implement -> Migrate(files only) -> Test -> Review
Date: 2026-11-17

## 1. Verified repository baseline
- Current branch before work: fix/trac-production-readiness; target branch did not exist.
- Uncommitted user work preserved untouched: DEPLOYMENT_READINESS_REPORT.md, docs/USER_GUIDE.md, 4 untracked public/icon-*-circle.png.
- auth: custom HMAC cookie (src/lib/session.ts:1-87), service-role Supabase via lazy proxy (src/lib/supabase.ts:16-36), all authz in route handlers (src/lib/authz.ts:8-17).
- member categories already supported 5 types (src/lib/types.ts:74; supabase/schema.sql:137).
- unique Student ID index already existed (supabase/schema.sql:179-181).
- no supabase/migrations/ directory existed; no departments/courses/year_level/section fields existed.

## 2. Actual existing gaps (verified evidence)
- P0: requireSession/requireAdmin never checked user.status (old src/lib/authz.ts:22-65); toPublicUser dropped status (old src/lib/auth.ts:25-32).
- P1: only 3 account roles in types.ts:13, staff-rules.ts:5-7, permissions.ts:15-35, users/route.ts:34-39, schema.sql:26-29.
- P1: student account creation wrote student_id:null, grade:null (old store.ts:783-784); approval path wrote the same and ignored insert errors (old api/users/[id]/route.ts:88-105).
- P1: no department/course master data or academic profile fields anywhere in src/ or supabase/.
- P1: dashboard stats had no user statistics (old store.ts:1408-1423) and loaded full tables incl. users with password_hash (old store.ts:1353-1365).
- P1: invalid member categories silently defaulted to student (old api/members/route.ts:6-11).
- P1: student-id duplicate errors were not mapped to 409 (old store.ts:499-502; api/members/route.ts:59-64).
- P2: baseline lint failed (28 errors, 35 warnings); npm test failed (Node 20 lacks --experimental-strip-types); npm run verify:loans failed (no POSTGRES_URL_NON_POOLING).
- No production Supabase/Render/Vercel settings were accessed. No SQL was executed.

## 3. Files created and modified
Created:
- src/lib/academic.ts — pure validation (required student fields, UUID checks, audit helper)
- src/lib/academic.test.ts — 7 new tests
- src/app/api/academic/route.ts — DB-backed department/course dropdown source
- src/app/api/admin/user-statistics/route.ts — admin-only, filter-capable account stats
- src/app/api/admin/student-completeness/route.ts — read-only completeness audit
- src/app/(desk)/admin-insights/page.tsx — statistics + audit UI
- supabase/migrations/20261117_academic_user_management_up.sql — idempotent additive migration
- supabase/migrations/20261117_academic_user_management_down.sql — rollback/limitations
Modified:
- src/lib/types.ts — 6 account roles, PATRON_ROLES/PRIVILEGED_ROLES, academic fields on Member, Department/Course/UserStatistics/audit types
- src/lib/permissions.ts — patron roles get borrower capabilities; librarian/admin unchanged
- src/lib/staff-rules.ts — six-role validator, privileged-role assignment guard
- src/lib/authz.ts — pending accounts blocked at every protected endpoint
- src/lib/auth.ts — PublicUser.status propagated
- src/lib/store.ts — academic validation, patron member linking for 4 roles, master-data/statistics/audit functions, duplicate mapping, 409 input errors
- src/app/api/users/route.ts — six roles, academic input validation, 400/409 responses
- src/app/api/users/[id]/route.ts — approval refuses incomplete students with 409 + missingFields, creates linked member with correct category
- src/app/api/members/route.ts, [id]/route.ts — strict category validation, academic fields, 400/409, no raw DB errors
- src/app/(desk)/staff/page.tsx — six-role selector, conditional academic fields, DB-backed dropdowns
- src/app/(desk)/members/page.tsx — same master data + academic fields on edit/create
- src/components/AppShell.tsx, KohaShell.tsx — Insights nav link

## 4. Six-role implementation status: COMPLETED (code)
student, faculty, teacher, community (patrons, linked members, borrower capability); librarian, admin (unchanged operational permissions). Privileged roles (librarian/admin) gated by requireAdmin. Only admins can assign roles. Pending accounts blocked in requireSession. DB CHECK constraint updated in migration file (NOT executed).

## 5-7. Department/course master data & student profile: COMPLETED (code + migration file)
Departments seeded verbatim: IAS, IUTES, ICS, ISCTS, IEDS (no expansions invented). Courses seeded verbatim: BSA, BSAB, BSF, BSIT, BSIS, BSW, BFLD, BTVTED, BSHM, BS Criminology. Stable UUID ids, unique codes, active flag, FK with ON DELETE SET NULL, partial unique Student ID index, one-profile-per-user index. No department-course mapping invented. grade kept separate from yearLevel (legacy). Year levels/sections are controlled lists; official lists still to be confirmed — flagged as OPEN.

## 8-9. Add-user / add-member workflows: COMPLETED
Role-driven conditional fields; Student requires all five academic fields in UI and server. Student profile created/linked at account creation; faculty/teacher/community get their own member categories; librarian/admin get no academic fields. Edits load and preserve existing values.

## 10. Registration validation: COMPLETED
Whitespace, missing/invalid fields, invalid categories, unauthorized roles, and duplicates rejected with 400/403/409; raw DB errors replaced with generic 500 plus secure console logging. Pending accounts cannot reach protected APIs even with a valid cookie.

## 11. Google registration / approval: PARTIAL
Pending/active lifecycle preserved; approval now checks student completeness before activation and reverts status on failure. Google sign-up still creates student-default accounts; allow-list behavior unchanged. Live Google OAuth not exercised (would require production credentials).

## 12. Completeness audit: COMPLETED
GET /api/admin/student-completeness reports all required counts, missing-field breakdown, duplicates and review rows with member id for correction; no deletes, no auto-deactivation, accounts/members counted separately.

## 13. Dashboard statistics: COMPLETED (code)
GET /api/admin/user-statistics derives counts from users and members via SQL (count_incomplete_student_profiles, filtered_user_statistics), supports role/status/department/course/yearLevel/section filters, does not transfer full tables to the browser. Existing dashboard page untouched (no redesign).

## 14. Migrations: COMPLETED (files only, NOT applied)
up/down SQL under supabase/migrations/. Idempotent, additive, preserves legacy rows, no NOT NULL on existing columns, rollback documents limitations (FKs/columns intentionally preserved). NOT EXECUTED against any database.

## 15. Security/authorization: COMPLETED with caveats
Server-side capability checks retained; pending-block added at central gate; admin-only role assignment and statistics; student ownership unchanged; service-role key never exposed. Note: legacy rows with NULL status are allowed by requireSession for backward compatibility (mapUser defaults to active); this is intentional to avoid locking out pre-status rows — flag for admin confirmation.

## 16. UI/UX: COMPLETED
Existing TRAC design system classes, responsive grids, loading/error states via existing components, required indicators, DB-backed dropdowns, field-specific validation server-side. No unrelated pages redesigned.

## 17. Test results (real command output)
- npx tsc --noEmit → exit 0
- npm run build → exit 0 (compiled successfully; 33 routes incl. 3 new API routes and /admin-insights)
- npm test → exit 9 at baseline (system Node 20 lacks --experimental-strip-types). Workaround: compiled TS tests with local TypeScript and ran node --test directly: 58/58 tests passed, including 7 new academic/role tests. The npm script itself remains broken for Node 20; fix requires Node 22+ or a transpiling runner (admin decision).
- npm run verify:loans → exit 1 at baseline (POSTGRES_URL_NON_POOLING missing from .env.local); unchanged; not a regression.
- npm run lint → exit 1 both before and after: 28 errors, 35 warnings. Zero errors/warnings in new files.

## 18. Remaining issues / open questions
1. Official expanded department names, year-level durations, and section list were not supplied — codes/controlled lists are placeholders pending admin confirmation.
2. Department-to-course mapping intentionally not created.
3. Migration not applied; RPC functions must exist before the statistics endpoints can return real counts on a fresh deployment.
4. Pending status check allows legacy NULL-status rows (intentional compatibility) — confirm policy.
5. npm test script needs Node 22+ or a TS runner.
6. verify:loans needs POSTGRES_URL_NON_POOLING configured to run.
7. No production deploy, no commit, no push, no production SQL execution.

## 19. Deployment readiness: NOT READY FOR PRODUCTION
Code and builds verified locally; schema changes exist only as reviewed SQL files. Apply migration in a controlled window after admin confirms master-data spellings, then re-run statistics endpoint probes. No deploy was performed.


---

# POST-IMPLEMENTATION VERIFICATION (independent, second pass)

Branch verified: feature/complete-user-academic-management; HEAD 64a6edb; no commits/pushes/merges.
User work untouched: DEPLOYMENT_READINESS_REPORT.md, docs/USER_GUIDE.md (1-line diff each, unchanged by this pass), 4 untracked icon PNGs. Stash empty.

## Defects found and fixed in this pass
1. P0 — legacy NULL/unknown account status failed open: mapUser (store.ts:195-205) normalized every non-"pending" value (including NULL) to "active", so the new authz.ts:46 pending guard could never fire for such rows. Fixed to normalize ONLY explicit "active" as active; everything else is "pending" (fail closed). Security implication: legacy rows with NULL/unknown status now require admin review/activation.
2. P1 — privileged-role assignment guard was dead code: assertPrivilegedRoleAssignment was never called. Wired into api/users/[id]/route.ts PATCH (defense in depth with requireAdmin).
3. Migration rollback: DROP TABLE departments/courses would fail while FK constraints referenced them; rollback now drops the two FKs first. The rollback no longer drops members_student_id_unique (it also belongs to baseline schema.sql:179-181).
4. Broken baseline tooling: npm test failed on Node 20 (--experimental-strip-types) — added scripts/run-tests.mjs using the installed TypeScript compiler (real tests, no suppression): 67/67 pass. npm run lint: 28 pre-existing errors fixed legitimately (typed `any` casts, escaped JSX entities, derived state instead of setState-in-effect, stable external-store clock); now 0 errors, 38 warnings. verify:loans now fails fast with an explicit BLOCKED prerequisite message (set -e pipefail bug on grep fixed).

## Verification statuses
- Six roles: COMPLETED in types, permissions (patron vs staff separation), staff-rules, users APIs, staff/members UI. DB CHECK verified in migration file (not applied).
- Security tests: COMPLETED — new src/lib/security-matrix.test.ts (9 tests) covers students/faculty/teachers/community restrictions, librarian/admin capabilities, all six role validators, privileged-role guard. All pass.
- Google registration: NOT VERIFIED live (no production credentials); code review confirms student-default, pending/active lifecycle unchanged.
- Academic master data: COMPLETED in migration file — verbatim codes only; no names/mappings/year-level durations/sections invented. NOT VERIFIED against live DB (network unreachable).
- Student registration: COMPLETED by code + 16 unit tests; live API/Database verification BLOCKED (no DB connectivity).
- Dashboard statistics: COMPLETED by code review — users/members are authoritative, no linked-account double counting, admin-only gate on stats; completeness audit gate is members.read (staff). Live counts NOT VERIFIED (db:check: fetch failed; DIRECT_URL auth failed).
- Migration: PARTIAL — files reviewed; idempotent/additive; safe ordering documented; NOT applied. Prerequisites: admin confirmation of master data; apply up SQL before deploying stats endpoints; verify role CHECK accepts 6 roles; existing status NULL rows need review after the fail-closed change.
- Lint: COMPLETED (exit 0, 0 errors, 38 warnings).
- TypeScript: COMPLETED (exit 0).
- Tests: COMPLETED (exit 0, 67/67).
- verify:loans: BLOCKED (exit 1, explicit prerequisite: POSTGRES_URL_NON_POOLING).
- Build: COMPLETED (exit 0).
- Diff audit: COMPLETED — no secrets added, no production data touched, cron/vercel/render/bookshelf untouched, no destructive migration.

## Production readiness decision
NOT READY FOR PRODUCTION. Blockers: migration not applied/not verified against live DB; live DB connectivity unavailable; verify:loans blocked by missing POSTGRES_URL_NON_POOLING; admin confirmation needed for master-data spellings and legacy NULL-status accounts. No commit/push/deploy performed.
