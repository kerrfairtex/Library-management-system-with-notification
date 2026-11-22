-- TRAC Library: per-patron notification e-mail settings.
-- IDEMPOTENT / ADDITIVE. NOT EXECUTED. Runs as one transaction.
-- Run on project wapnzuawqhekgkqpgphj only (see docs/migrations-applied.md).
-- Apply after 20261125_patron_notices.sql.
-- Undo: 20261126_notification_prefs_down.sql.
--
-- members.notification_prefs holds what a patron chose on My profile, e.g.
--   {"email_off": ["due_soon", "hold_expiring"]}
-- Every notice still appears in the in-app inbox; this only decides which
-- ones are ALSO e-mailed (src/lib/notification-prefs.ts, read by
-- dispatchNotificationEmails). Empty object = e-mail everything (the
-- behaviour before this migration). The app validates the keys it writes.

begin;

alter table public.members
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'members_notification_prefs_object'
       and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_notification_prefs_object
      check (jsonb_typeof(notification_prefs) = 'object');
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
