-- TRAC Library: atomic last-active-admin protection + role transition.
-- IDEMPOTENT / ADDITIVE. NOT EXECUTED. Apply only to staging after review.
-- All guards run inside a transaction with SELECT ... FOR UPDATE on the admin
-- row, so concurrent demote/deactivate/delete operations serialize.

-- 0. Shared invariant lock. Every RPC that can change the active-admin count
-- calls this FIRST, before any count or mutation. Transaction-scoped advisory
-- locks serialize across all sessions and are released automatically on
-- COMMIT/ROLLBACK. Constant 727314 is derived from the TRAC admin invariant.
create or replace function public.lock_admin_invariant()
returns void language sql volatile
  set search_path = public, pg_temp as $$
  select pg_advisory_xact_lock(727314);
$$;

-- 1. Role + linked member category in one transaction, with last-admin guard.
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

-- 2. Status deactivation guard with the same locking discipline.
create or replace function public.change_user_status(
  p_user_id uuid,
  p_next_status text,
  p_actor_id uuid
)
returns public.users language plpgsql security invoker
  set search_path = public, pg_temp as $$
declare
  v_target public.users;
  v_active_admins integer;
begin
  -- Serialize the global active-admin invariant before touching any row.
  perform public.lock_admin_invariant();

  if p_next_status not in ('pending','active') then
    raise exception 'Invalid status.' using errcode = '22023';
  end if;
  select * into v_target from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;
  if v_target.id = p_actor_id then
    raise exception 'You cannot change your own verification status.' using errcode = '23514';
  end if;
  if v_target.role = 'admin' and v_target.status = 'active' and p_next_status <> 'active' then
    select count(*) into v_active_admins from public.users
      where role = 'admin' and status = 'active' and id <> v_target.id for share;
    if v_active_admins < 1 then
      raise exception 'The library needs at least one active admin.' using errcode = '23514';
    end if;
  end if;
  update public.users set status = p_next_status where id = v_target.id;
  select * into v_target from public.users where id = v_target.id;
  return v_target;
end $$;

-- 3. Deletion guard with the same locking discipline.
create or replace function public.delete_user_guarded(
  p_user_id uuid,
  p_actor_id uuid
)
returns boolean language plpgsql security invoker
  set search_path = public, pg_temp as $$
declare
  v_target public.users;
  v_active_admins integer;
begin
  -- Serialize the global active-admin invariant before touching any row.
  perform public.lock_admin_invariant();

  select * into v_target from public.users where id = p_user_id for update;
  if not found then return false; end if;
  if v_target.id = p_actor_id then
    raise exception 'You cannot delete your own account.' using errcode = '23514';
  end if;
  if v_target.role = 'admin' and v_target.status = 'active' then
    select count(*) into v_active_admins from public.users
      where role = 'admin' and status = 'active' and id <> v_target.id for share;
    if v_active_admins < 1 then
      raise exception 'The library needs at least one active admin.' using errcode = '23514';
    end if;
  end if;
  delete from public.users where id = v_target.id;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. EXECUTION PRIVILEGES (explicit; never rely on defaults)
--
-- The app connects with SUPABASE_SERVICE_ROLE_KEY (src/lib/supabase.ts:18-26).
-- New functions inherit EXECUTE from PUBLIC, which anon/authenticated inherit.
-- Revoke that default and grant ONLY the server-side role. Untrusted callers
-- therefore cannot invoke these mutations directly through PostgREST.
-- ---------------------------------------------------------------------------
revoke all on function public.lock_admin_invariant() from public, anon, authenticated;
grant execute on function public.lock_admin_invariant() to service_role;

revoke all on function public.change_user_role(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.change_user_status(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_user_guarded(uuid, uuid) from public, anon, authenticated;

grant execute on function public.change_user_role(uuid, text, uuid) to service_role;
grant execute on function public.change_user_status(uuid, text, uuid) to service_role;
grant execute on function public.delete_user_guarded(uuid, uuid) to service_role;

-- Authorization boundary: PostgreSQL restricts EXECUTE to the server-only
-- service_role. Actor authentication/admin authorization remains enforced in
-- the API route (requireAdmin + assertPrivilegedRoleAssignment) before these
-- RPCs are called. p_actor_id is an audit/self-operation argument ONLY, never
-- proof of identity. Do NOT add an auth.uid() assertion: the service-role
-- client has no per-user JWT, so such a check would always fail.



-- 5. Student approval: validate completeness and master-data references inside
-- the same transaction as the status change. Fails closed; no partial approval.
create or replace function public.approve_student_account(
  p_user_id uuid,
  p_actor_id uuid
)
returns public.users language plpgsql security invoker
  set search_path = public, pg_temp as $$
declare
  v_user public.users;
  v_member public.members;
  v_missing text[] := array[]::text[];
begin
  -- Uniform invariant lock (activation only; cannot reduce admin count).
  perform public.lock_admin_invariant();

  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'User not found.' using errcode = 'P0002'; end if;
  if v_user.id = p_actor_id then
    raise exception 'You cannot change your own verification status.' using errcode = '23514';
  end if;
  if v_user.role <> 'student' then
    raise exception 'Only student accounts use this approval path.' using errcode = '22023';
  end if;

  select * into v_member from public.members where user_id = p_user_id for update;
  if not found then
    raise exception 'Linked student member profile is missing.' using errcode = '23514';
  end if;
  if v_member.member_type <> 'student' then
    raise exception 'Linked member is not a student.' using errcode = '23514';
  end if;

  if v_member.student_id is null or btrim(v_member.student_id) = '' then
    v_missing := array_append(v_missing, 'studentId');
  end if;
  if v_member.department_id is null or not exists (
      select 1 from public.departments d where d.id = v_member.department_id
    ) then
    v_missing := array_append(v_missing, 'departmentId');
  end if;
  if v_member.course_id is null or not exists (
      select 1 from public.courses c where c.id = v_member.course_id
    ) then
    v_missing := array_append(v_missing, 'courseId');
  end if;
  if v_member.year_level is null or btrim(v_member.year_level) = '' then
    v_missing := array_append(v_missing, 'yearLevel');
  end if;
  if v_member.section is null or btrim(v_member.section) = '' then
    v_missing := array_append(v_missing, 'section');
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Incomplete student profile: %', array_to_string(v_missing, ', ')
      using errcode = '23514';
  end if;

  -- Unique Student ID is enforced by members_student_id_unique (schema.sql:179).
  -- Any duplicate raises 23505 here and rolls back the approval.
  update public.users set status = 'active' where id = p_user_id;
  select * into v_user from public.users where id = p_user_id;
  return v_user;
end $$;

revoke all on function public.approve_student_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_student_account(uuid, uuid) to service_role;
