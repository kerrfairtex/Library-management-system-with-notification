# Pre-migration safety notes — TRAC Library

Scope: targeted safety corrections for the six-role / academic-profile migration.
No production SQL was executed. No records were changed. No privileged bypass
was implemented.

## 1. Role constraint (fail fast)

supabase/migrations/20261117_academic_user_management_up.sql now RAISES an
exception if users_role_check cannot be established. Previously the DO block
caught every error and only emitted a NOTICE, allowing a migration to report
success with a missing/incomplete role constraint.

Idempotency is preserved: DROP CONSTRAINT IF EXISTS followed by ADD CONSTRAINT,
inside DO $$ ... $$ — re-running produces the same final state. No unrelated
constraint is dropped or replaced.

After apply, run the read-only verification queries appended to the migration
file (section 6). Expected result: pg_get_constraintdef(users_role_check)
contains all six roles; all six role INSERT probes succeed in a rolled-back
transaction; an invalid role fails with SQLSTATE 23514.

## 2. Duplicate linked member profiles

Read-only detection query (also in the migration file, section 6c):

  select user_id, count(*) as profile_count,
         array_agg(id order by joined_at) as member_ids
  from public.members
  where user_id is not null
  group by user_id
  having count(*) > 1
  order by profile_count desc;

If this returns rows, the partial unique index members_one_user_profile_per_user
will fail to apply. Administrators must review each group manually: identify
which profile holds the historical loans/fines, choose a canonical record, and
record the decision. Never auto-delete or auto-merge. Do not apply the index
until duplicates are reconciled; no records are modified by this audit.

## 3. Legacy NULL-status administrators — recovery analysis

Current behavior (verified in code):
- src/lib/store.ts:202-204 maps ONLY explicit "active" to active; NULL or
  unknown values become "pending" (fail closed).
- src/lib/authz.ts:44-54 blocks every protected endpoint for non-active users,
  INCLUDING /api/users and /api/users/[id].
- src/lib/staff-rules.ts:92-101 forbids an account from changing its own status.
- Login (src/app/api/auth/login/route.ts:57) and Google (route.ts:62) reject
  accounts whose raw status is exactly "pending"; a NULL value passes those
  pre-checks but is still blocked by the API-layer gate after sign-in.
- Baseline schema.sql:45 backfills NULL -> active and :50-56 tries to set
  NOT NULL, but the DO block swallows failure, so NULL rows are possible.

Consequence: an administrator whose status is NULL cannot use the UI to recover,
and cannot activate themselves. If EVERY administrator is affected, no
application-level recovery path exists — by design, to avoid a privileged
bypass.

Safest recovery process (administrator-controlled, no code bypass):
1. Obtain read-only database access (DBA / Supabase dashboard SQL editor).
2. Count affected accounts by role:
     select role, count(*) from public.users
     where status is null or btrim(status) = '' group by role;
3. An authorized administrator reviews each affected account against an
   external identity source (Google account / institutional roster).
4. Activate ONLY verified accounts, one explicit statement each:
     update public.users set status = 'active'
     where id = '<verified-uuid>' and status is null;
   Never run a bulk UPDATE. Keep the SQL and approver in the change log.
5. Confirm at least one activated administrator can sign in and reach
   /api/users before allowing other accounts to be activated.
6. The baseline backfill (schema.sql:45) is the ONLY automated status write and
   it runs as part of the original schema script, not this migration.

No public recovery endpoint, no self-promotion, no hardcoded credentials, and
no bypass of normal authentication was added. If a privileged recovery feature
is ever required, it needs a separate security review and explicit approval.

## 4. Shelf-origin naming

Verified responsibilities:
- NEXT_PUBLIC_LIBRARY_ORIGIN = Render TRAC desk URL, consumed by the Vercel
  shelf for borrow links (src/app/shelf/site-config.ts:25-27,
  src/app/shelf/catalog.ts:2,59, src/app/shelf/ProgressLibrary.tsx:16-18).
- NEXT_PUBLIC_SHELF_ORIGIN = Vercel bookshelf URL, consumed by the Render desk's
  KohaShell nav (src/components/KohaShell.tsx:21,206) with an existing fallback.

Canonical strategy: keep BOTH names, each describing the origin it points TO,
and set them in the environment of the app that consumes them (Render desk sets
NEXT_PUBLIC_SHELF_ORIGIN; Vercel shelf sets NEXT_PUBLIC_LIBRARY_ORIGIN). No
deployment file was modified. The fallback behavior in code is unchanged.
.env.example now documents both variables with placeholder values only.

## 5. Academic master data (unchanged)

Departments: IAS, IUTES, ICS, ISCTS, IEDS.
Courses: BSA, BSAB, BSF, BSIT, BSIS, BSW, BFLD, BTVTED, BSHM, BS Criminology.
No expansions, no course-to-department mappings, no section/year-level values
were added. ISCTS spelling remains flagged for administrator confirmation.


## 6. Duplicate-profile query — schema prerequisite

The read-only duplicate query in section 2 depends on public.members.user_id.
That column is NOT defined in supabase/schema.sql; it is added by
supabase/archive/MISSING_COLUMNS_MIGRATION.sql:16 (`ADD COLUMN IF NOT EXISTS user_id uuid
REFERENCES public.users(id)`). Before running the query on staging, confirm the
column exists (read-only):

  select column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'members'
    and column_name = 'user_id';

Expected: exactly one row with data_type = uuid. If absent, the query is not
applicable to that database and the linked-profile audit must be deferred.

## 7. Staging execution checklist (document only — NOT executed)

Perform in this exact order. Each step requires explicit operator action and
evidence capture; none of these steps has been performed by this audit.

1. Confirm staging database identity: verify the Supabase project URL/ref shown
   by the environment differs from production; record the ref (not secrets).
2. Take a verified backup or snapshot of the staging database; confirm it
   completed before continuing.
3. Run the duplicate linked-profile query (section 2 / migration section 6c).
   Expect 0 rows. If duplicates exist, STOP for manual review.
4. Review legacy NULL-status accounts with the read-only query in section 3;
   decide case by case. No bulk activation.
5. Confirm department master-data spellings: IAS, IUTES, ICS, ISCTS, IEDS.
   ISCTS remains flagged for administrator confirmation.
6. Review the full up and rollback SQL, including the fail-fast role constraint
   and the appended verification queries.
7. Apply the migration to STAGING ONLY after explicit written authorization.
8. Run post-migration verification: catalog definition check (6a), valid-role
   probes (6b), invalid-role probe (6b2), and unique-index presence. All probes
   run inside rolled-back transactions.
9. Run student registration and account-role tests through the staging desk:
   all six roles, missing academic fields, duplicate Student ID, and approval
   refusal for incomplete student profiles.
10. Run circulation verification: `npm run verify:loans` against staging using
    a staging POSTGRES_URL_NON_POOLING. All checks are rolled back.
11. Verify dashboard statistics endpoints against staging, comparing counts to
    read-only SQL queries on users/members.
12. Record results, evidence, and remaining defects in the staging change log.

## 8. Environment prerequisites (names only — no values)

Render dashboard (render.yaml): SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_LIBRARY_ORIGIN (set by the
platform), NEXT_PUBLIC_SHELF_ORIGIN (recommended, optional due to fallback),
AUTH_SECRET, CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY (server-only secret).

Vercel bookshelf (vercel.json): NEXT_PUBLIC_LIBRARY_ORIGIN (Render desk URL),
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; build command
`next build`; cron uses CRON_SECRET server-side.

Supabase: service-role key for server-only store access; publishable key for
the browser Google OAuth handshake; direct/session Postgres connection string
for local read-only verification scripts.

Local circulation verification: POSTGRES_URL_NON_POOLING (direct connection,
NOT the pooler), psql on PATH. Missing as of this audit — verify:loans is BLOCKED.

No secret values are recorded in this document. No production URLs were invented.


## 9. SQL syntax validation evidence (local, NOT production/staging)

A throwaway local PostgreSQL 18.2 cluster (unix socket in /tmp, port 55432,
trust auth, no production connection) was created solely to validate syntax.
It was stopped and deleted after the checks.

- Duplicate-profile query, NULL-status count query, and pg_constraint catalog
  query all executed successfully against a minimal schema with the documented
  columns (public.users role/status, public.members user_id/joined_at).
- Catalog query result: verified = t, definition contains all six roles.
- Role probes: INSERT 0 6; six valid roles accepted; ROLLBACK left 0 rows.
- Invalid-role probe: failed with SQLSTATE 23514 (check_violation) and the
  error names users_role_check; ROLLBACK left 0 rows.

This is SYNTAX/BEHAVIOR VALIDATION on a local scratch database only. It is NOT
live staging execution and NOT production execution. Staging behavior must be
re-verified after the authorized migration apply (checklist section 7).
