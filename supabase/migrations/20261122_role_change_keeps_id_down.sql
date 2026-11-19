-- Reverts 20261122_role_change_keeps_id.sql: restores the three-argument
-- change_user_role from 20261118_admin_protection_atomic.sql, which clears
-- the ID number on every role change. Roll the app code back first:
-- the newer app passes p_id_number, which this version does not accept.
revoke all on function public.change_user_role(uuid, text, uuid, text) from service_role;
drop function if exists public.change_user_role(uuid, text, uuid, text);

create or replace function public.change_user_role(
  p_user_id uuid,
  p_next_role text,
  p_actor_id uuid
)
returns public.users language plpgsql security invoker
  set search_path = public, pg_temp as $$
declare
  v_target public.users;
  v_active_admins integer;
  v_patron boolean;
begin
  -- Serialize the global active-admin invariant before touching any row.
  perform public.lock_admin_invariant();

  if p_next_role not in ('student','faculty','teacher','community','librarian','admin') then
    raise exception 'Invalid role: %', p_next_role using errcode = '22023';
  end if;

  -- Lock the target row for the duration of the transaction.
  select * into v_target from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;

  -- An admin cannot remove their own admin role.
  if v_target.id = p_actor_id and v_target.role = 'admin' and p_next_role <> 'admin' then
    raise exception 'You cannot remove your own admin role.' using errcode = '23514';
  end if;

  -- Count other ACTIVE admins under the same lock set.
  if v_target.role = 'admin' and p_next_role <> 'admin' then
    select count(*) into v_active_admins from public.users
      where role = 'admin' and status = 'active' and id <> v_target.id for share;
    if v_active_admins < 1 then
      raise exception 'The library needs at least one active admin.' using errcode = '23514';
    end if;
  end if;

  update public.users set role = p_next_role where id = v_target.id;

  -- Canonical member category follows the account role; student-only fields
  -- are cleared when leaving the student category. No profile is deleted.
  v_patron := p_next_role in ('student','faculty','teacher','community');
  update public.members set
    member_type = case when v_patron then p_next_role else 'staff' end,
    student_id = null,
    department_id = null,
    course_id = null,
    year_level = null,
    section = null
  where user_id = v_target.id;

  select * into v_target from public.users where id = v_target.id;
  return v_target;
end $$;

revoke all on function public.change_user_role(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.change_user_role(uuid, text, uuid) to service_role;
