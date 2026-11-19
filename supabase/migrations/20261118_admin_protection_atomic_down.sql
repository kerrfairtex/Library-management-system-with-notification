-- Rollback: remove only the functions created by the up file.
-- Explicitly revoke the grants added by the up migration before dropping.
revoke all on function public.lock_admin_invariant() from service_role;
revoke all on function public.change_user_role(uuid, text, uuid) from service_role;
revoke all on function public.change_user_status(uuid, text, uuid) from service_role;
revoke all on function public.approve_student_account(uuid, uuid) from service_role;
revoke all on function public.delete_user_guarded(uuid, uuid) from service_role;

drop function if exists public.lock_admin_invariant();
drop function if exists public.approve_student_account(uuid, uuid);
drop function if exists public.delete_user_guarded(uuid, uuid);
drop function if exists public.change_user_status(uuid, text, uuid);
drop function if exists public.change_user_role(uuid, text, uuid);
-- No data is modified. The pre-application route behavior is restored by
-- reverting the application code, not by altering users/members rows.
