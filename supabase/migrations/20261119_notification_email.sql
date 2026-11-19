-- TRAC Library: e-mail copies of member notifications (src/lib/email.ts).
-- IDEMPOTENT / ADDITIVE. NOT EXECUTED. Apply after 20261118_admin_protection_atomic.sql.
-- emailed_at marks a notification as claimed for e-mail, so a sweep that runs
-- twice (Vercel cron + GitHub Action) can never send the same notice twice.
-- Existing rows are stamped so turning e-mail on does not mail the backlog.
alter table public.notifications
  add column if not exists emailed_at timestamptz;

update public.notifications set emailed_at = created_at where emailed_at is null;

create index if not exists notifications_email_pending_idx
  on public.notifications (created_at)
  where emailed_at is null and audience = 'member';
