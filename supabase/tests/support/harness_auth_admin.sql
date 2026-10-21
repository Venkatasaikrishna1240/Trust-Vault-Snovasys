-- Local test-harness substitute for Supabase Auth Admin user deletion.
-- This file is installed only by pg-local.sh and is not a production migration.
create function public.harness_delete_auth_user(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = p_user;
  return found;
end;
$$;
revoke all on function public.harness_delete_auth_user(uuid) from public, anon, authenticated;
grant execute on function public.harness_delete_auth_user(uuid) to service_role;
