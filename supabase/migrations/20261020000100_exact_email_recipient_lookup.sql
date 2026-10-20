-- Restrict recipient lookup to a complete, exact email address rather than a
-- partial-name or partial-email directory search.
create or replace function public.svc_search_share_recipients(p_actor uuid, p_query text, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients jsonb;
begin
  if p_actor is null or p_request is null or p_query is null or char_length(btrim(p_query)) not between 3 and 100 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  if app.actor_role(p_actor) is null then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  if app.throttle_check(p_actor, p_request) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if (select count(*) from public.audit_events e
       where e.actor_id = p_actor and e.action = 'permission.recipient_search'
         and e.occurred_at > clock_timestamp() - interval '1 minute') >= 30 then
    if not exists (select 1 from public.audit_events e where e.actor_id = p_actor
                    and e.action = 'request.rate_limited'
                    and e.occurred_at > clock_timestamp() - interval '1 minute') then
      perform app.write_audit(p_actor, null, 'request.rate_limited', 'denied', p_request,
                              jsonb_build_object('reason', 'recipient_search_limit'));
    end if;
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email, 'display_name', r.display_name)
                            order by r.display_name, r.email), '[]'::jsonb)
    into v_recipients
    from (
      select p.id, p.email, p.display_name
        from public.profiles p
       where p.id <> p_actor
         and lower(p.email) = lower(btrim(p_query))
       order by p.display_name, p.email
       limit 20
    ) r;

  perform app.write_audit(p_actor, null, 'permission.recipient_search', 'success', p_request,
                          jsonb_build_object('query_length', char_length(btrim(p_query)),
                                             'results', jsonb_array_length(v_recipients)));
  return jsonb_build_object('ok', true, 'recipients', v_recipients);
end;
$$;

revoke all on function public.svc_search_share_recipients(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.svc_search_share_recipients(uuid, text, uuid) to service_role;
