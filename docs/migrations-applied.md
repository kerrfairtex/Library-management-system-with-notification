# Database changes applied to production

The record of which SQL files have been run against the production Supabase
database. Update it every time a script is applied there.

To check the live state at any time, run
[`supabase/checks/migration-status.sql`](../supabase/checks/migration-status.sql)
in the Supabase SQL editor. It only reads.

| Change | File | Applied | How |
|---|---|---|---|
| 20261117 academic user management | [`migrations/20261117_academic_user_management_up.sql`](../supabase/migrations/20261117_academic_user_management_up.sql) | 2026-11-21 | Partly applied earlier (member columns and `users_role_check`); the rest via the catch-up script below |
| 20261118 admin protection | [`migrations/20261118_admin_protection_atomic.sql`](../supabase/migrations/20261118_admin_protection_atomic.sql) | 2026-11-21 | Directly |
| 20261119 notification email | [`migrations/20261119_notification_email.sql`](../supabase/migrations/20261119_notification_email.sql) | 2026-11-21 | Directly |
| 20261120 course department | [`migrations/20261120_course_department.sql`](../supabase/migrations/20261120_course_department.sql) | 2026-11-21 | Via the catch-up script below |
| 20261121 member ID per type | [`migrations/20261121_member_id_per_type.sql`](../supabase/migrations/20261121_member_id_per_type.sql) | 2026-11-21 | Directly |
| 20261122 role change keeps ID | [`migrations/20261122_role_change_keeps_id.sql`](../supabase/migrations/20261122_role_change_keeps_id.sql) | 2026-11-21 | Directly |
| Catch-up for 17 and 20 | [`catch-up/20261121_catch_up_17_20.sql`](../supabase/catch-up/20261121_catch_up_17_20.sql) | 2026-11-21 | Directly |
| Access hardening | [`security/20261121_hardening.sql`](../supabase/security/20261121_hardening.sql) | 2026-11-21 | Directly |
| Core tables lockdown + session revocations | [`security/20261123_core_tables_lockdown.sql`](../supabase/security/20261123_core_tables_lockdown.sql) | 2026-11-22 | Directly, on project `wapnzuawqhekgkqpgphj` |
| 20261123 circulation rules enforced | [`migrations/20261123_circulation_rules_enforced.sql`](../supabase/migrations/20261123_circulation_rules_enforced.sql) | 2026-11-22 | Directly, on project `wapnzuawqhekgkqpgphj` |
| 20261124 hold queue | [`migrations/20261124_hold_queue.sql`](../supabase/migrations/20261124_hold_queue.sql) | 2026-11-22 | Directly, on project `wapnzuawqhekgkqpgphj` |
| 20261125 patron notices | [`migrations/20261125_patron_notices.sql`](../supabase/migrations/20261125_patron_notices.sql) | 2026-11-22 | Directly, on project `wapnzuawqhekgkqpgphj` |
| 20261126 notification prefs | [`migrations/20261126_notification_prefs.sql`](../supabase/migrations/20261126_notification_prefs.sql) | 2026-11-22 | Directly, on project `wapnzuawqhekgkqpgphj` |

## Do not re-run

- **20261117 in full.** It recreates `members_student_id_unique`, which
  20261121 replaced with a per-type index. On this database it fails if a
  student and a faculty member share an ID, and if it succeeds it blocks them
  from sharing one again.
- **20261118 in full.** It recreates the old three-argument
  `change_user_role`, which wipes the ID number on every role change, next to
  the four-argument version from 20261122.
- **Any `_down.sql` file.**

The catch-up and hardening scripts are safe to run again.

## Access rules set by the hardening script

- **departments, courses:** RLS on. Anyone (`anon`, `authenticated`) may
  read them through the `public read` policies; only the service role may
  change them.
- **book_items:** `anon` and `authenticated` may read every column except
  `notes`. The grant is per column, made when the script ran.
- **users, members, books, loans, holds, fines, notifications,
  circulation_rules, settings, session_revocations** (core tables lockdown):
  RLS on and every privilege revoked from `anon` and `authenticated`. The
  older "Staff …", "Student own …", "Admin …" and "Public can read books
  catalog" policies are still defined but grant nothing without privileges.
  Only the service role (the app's server) can read or write these tables.
- **checkout_loan, return_loan, renew_loan, sweep_loan_statuses,
  sync_book_availability_after_change, trap_holds:** callable by the service
  role only.

> **Shared account:** another Supabase project in the same account has tables
> with the same names (`users`, `books`, `notifications`) that belong to a
> different app. Run TRAC SQL only on project `wapnzuawqhekgkqpgphj`. The
> lockdown script checks each table's columns and aborts if they are not
> TRAC's.

> **When you add a column to `book_items`:** it is not readable with the
> publishable key until you grant it. If the public catalog should show it,
> run:
>
> ```sql
> grant select (new_column) on public.book_items to anon, authenticated;
> ```
>
> Never grant `notes`. The app's own queries use the service-role key and
> are not affected.
