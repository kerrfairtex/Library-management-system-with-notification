-- Undo 20261126_notification_prefs.sql. NOT EXECUTED.
-- Drops every patron's e-mail choices; afterwards all notices are e-mailed again.

begin;

alter table public.members drop constraint if exists members_notification_prefs_object;
alter table public.members drop column if exists notification_prefs;

commit;

notify pgrst, 'reload schema';
