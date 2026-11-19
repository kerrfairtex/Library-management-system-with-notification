-- TRAC Library: role changes keep or take an ID number instead of wiping it.
-- IDEMPOTENT. NOT EXECUTED. Apply after 20261121_member_id_per_type.sql.
--
-- Before: change_user_role cleared members.student_id on every role change,
-- so "Make faculty" left a faculty member without the Employee/Faculty ID the
-- app requires. Now (mirrors idNumberAfterTypeChange in src/lib/academic.ts):
--   * an ID passed in p_id_number is trimmed and saved;
--   * otherwise faculty <-> teacher keep their current ID (same kind of ID);
--   * otherwise the ID is cleared (a Student ID is not an Employee ID);
--   * a student/faculty/teacher member left without an ID is refused with
--     SQLSTATE 23502 and the whole change rolls back;
--   * a duplicate ID within the new member type raises 23505 from
--     members_type_id_number_unique and rolls back.
-- Department, course, year level and section are still cleared, as before.
-- Same-role calls no longer touch the member row.
--
-- p_id_number has a default, so existing three-argument calls keep working.

drop function if exists public.change_user_role(uuid, text, uuid);

create or replace function public.change_user_role(
  p_user_id uuid,
  p_next_role text,
  p_actor_id uuid,
  p_id_number text default null
)
returns public.users language plpgsql security invoker
  set search_path = public, pg_temp as $$
declare
  v_target public.users;
  v_member public.members;
  v_active_admins integer;
  v_prev_type text;
  v_next_type text;
  v_id text;
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

  if v_target.role = p_next_role then
    return v_target;
  end if;

  update public.users set role = p_next_role where id = v_target.id;

  select * into v_member from public.members where user_id = v_target.id for update;
  if found then
    v_prev_type := v_member.member_type;
    v_next_type := case when p_next_role in ('student','faculty','teacher','community')
                        then p_next_role else 'staff' end;

    v_id := nullif(btrim(coalesce(p_id_number, '')), '');
    if v_next_type = 'staff' then
      v_id := null;
    elsif v_id is null
      and v_prev_type in ('faculty','teacher') and v_next_type in ('faculty','teacher') then
      v_id := nullif(btrim(coalesce(v_member.student_id, '')), '');
    end if;

    if v_id is null and v_next_type in ('student','faculty','teacher') then
      raise exception 'An ID number is required for % members.', v_next_type
        using errcode = '23502';
    end if;

    update public.members set
      member_type = v_next_type,
      student_id = v_id,
      department_id = null,
      course_id = null,
      year_level = null,
      section = null
    where id = v_member.id;
  end if;

  select * into v_target from public.users where id = v_target.id;
  return v_target;
end $$;

-- Server-side role only (see 20261118_admin_protection_atomic.sql).
revoke all on function public.change_user_role(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.change_user_role(uuid, text, uuid, text) to service_role;
