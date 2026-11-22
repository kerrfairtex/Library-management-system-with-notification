-- TRAC Library: deny-by-default access to the core tables, plus session
-- revocation storage for src/lib/session-store.ts.
-- IDEMPOTENT: safe to run again. Runs as one transaction. NOT EXECUTED.
-- Apply after supabase/security/20261121_hardening.sql.
--
-- STEP 0 (read-only, run first and keep the output): what can the public
-- (anon) and `authenticated` roles do on these tables today?
--
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee in ('anon', 'authenticated')
--     and table_name in ('users','members','books','loans','holds','fines',
--                        'notifications','circulation_rules','settings')
--   group by table_name, grantee
--   order by table_name, grantee;
--
--   select relname, relrowsecurity
--   from pg_class
--   where relnamespace = 'public'::regnamespace
--     and relname in ('users','members','books','loans','holds','fines',
--                     'notifications','circulation_rules','settings');
--
--   -- Existing API policies. TRAC's own SQL only ever created policies named
--   -- like "Admins ... settings", "Public can read books catalog", "Staff ...",
--   -- "User read own profile", "Admin select users". Any OTHER policy here
--   -- means another app reads or writes the table through the API: stop and
--   -- check with that app before running this script.
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('users','members','books','loans','holds','fines',
--                       'notifications','circulation_rules','settings')
--   order by tablename, policyname;
--
-- Why this is safe for the app: every table read and write goes through the
-- service-role key (src/lib/supabase.ts), which bypasses RLS and grants. The
-- anon key is used in the browser only for Supabase Auth (Google sign-in in
-- src/app/login and src/app/auth/callback), never for table access.
-- book_items, departments and courses keep their public read access from
-- 20261121_hardening.sql and are not touched here.

begin;

-- ---------------------------------------------------------------------------
-- 1. Core tables: RLS on with NO policies (deny everything to anon and
--    authenticated), and every table privilege revoked from those roles.
-- ---------------------------------------------------------------------------
-- SHARED PROJECT GUARD: this Supabase project also hosts another app. Each
-- table must carry TRAC's own columns before anything is changed; if one
-- does not (it belongs to the other app, or is shared with it), the whole
-- script aborts and nothing is applied.
do $$
declare
  r record;
  v_missing text := '';
begin
  for r in
    select * from (values
      ('users',             array['password_hash', 'role', 'status', 'auth_user_id']),
      ('members',           array['member_type', 'user_id', 'active']),
      ('books',             array['isbn', 'total_copies', 'available_copies']),
      ('loans',             array['book_id', 'member_id', 'due_at', 'returned_at']),
      ('holds',             array['book_id', 'member_id', 'kind', 'priority']),
      ('fines',             array['member_id']),
      ('notifications',     array['audience', 'recipient_member_id', 'related_id']),
      ('circulation_rules', array['member_type', 'max_renewals', 'max_loans']),
      ('settings',          array['key', 'value', 'category'])
    ) as t(tbl, cols)
  loop
    if to_regclass(format('public.%I', r.tbl)) is null then
      continue;
    end if;
    if exists (
      select 1 from unnest(r.cols) c
       where not exists (
         select 1 from information_schema.columns ic
          where ic.table_schema = 'public' and ic.table_name = r.tbl and ic.column_name = c
       )
    ) then
      v_missing := v_missing || ' ' || r.tbl;
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'Lockdown aborted, nothing changed: public.% do not look like TRAC tables (shared project?).', v_missing;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'members', 'books', 'loans', 'holds', 'fines',
    'notifications', 'circulation_rules', 'settings'
  ]
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'Skipping missing table public.%', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Session revocation (src/lib/session-store.ts).
--    A row with sid set revokes that one session (logout).
--    A row with not_before set revokes every session of that user issued
--    before that moment (password reset, account disabled).
--    expires_at lets old rows be purged: a token is useless after it anyway.
-- ---------------------------------------------------------------------------
create table if not exists public.session_revocations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  sid text,
  not_before timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint session_revocations_target check (sid is not null or not_before is not null)
);

create index if not exists session_revocations_user_idx
  on public.session_revocations (user_id);
create index if not exists session_revocations_expires_idx
  on public.session_revocations (expires_at);

alter table public.session_revocations enable row level security;
revoke all on public.session_revocations from anon, authenticated;

commit;

-- Optional housekeeping, safe at any time:
--   delete from public.session_revocations where expires_at < now();
