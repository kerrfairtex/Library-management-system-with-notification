-- Reverts 20261119_notification_email.sql.
drop index if exists public.notifications_email_pending_idx;
alter table public.notifications drop column if exists emailed_at;
