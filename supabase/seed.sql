-- LOCAL DEVELOPMENT ONLY. Fictional demo accounts for `supabase db reset`.
-- Refuses to run if any real (non-@trustvault.test) user exists, so it cannot touch production data.
-- Password for ALL local demo users: LocalDemo-Only-1234  (never use anywhere real).
-- Documents/grants are created through the real API by `npm run provision:demo`.
do $$
begin
  if exists (select 1 from auth.users where email not like '%@trustvault.test') then
    raise exception 'seed.sql refused: real users exist';
  end if;
end $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
       extensions.crypt('LocalDemo-Only-1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', v.name), now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@trustvault.test',  'Asha Admin'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'owner@trustvault.test',  'Omar Owner'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'owner2@trustvault.test', 'Olga Owner'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'viewer@trustvault.test', 'Vik Viewer'),
  ('00000000-0000-4000-8000-000000000005'::uuid, 'outsider@trustvault.test','Uma Unrelated')
) as v(id, email, name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u where u.email like '%@trustvault.test'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- Trusted provisioning of roles (the profile trigger always starts everyone as 'viewer').
update public.profiles set role = 'admin' where email = 'admin@trustvault.test';
update public.profiles set role = 'owner' where email in ('owner@trustvault.test', 'owner2@trustvault.test');
