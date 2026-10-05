create schema if not exists private;

create table if not exists private.order_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  blocked_until timestamptz
);

revoke all on table private.order_rate_limits from public, anon, authenticated;

create or replace function public.check_order_rate_limit(p_ip_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.order_rate_limits%rowtype;
  v_window interval := interval '10 minutes';
  v_limit integer := 8;
begin
  if p_ip_hash is null or length(trim(p_ip_hash)) <> 64 then
    raise exception 'Identificador de origem inválido';
  end if;

  insert into private.order_rate_limits(ip_hash, window_started_at, request_count, blocked_until)
  values(trim(p_ip_hash), p_now, 1, null)
  on conflict (ip_hash) do nothing;

  select * into v_row
  from private.order_rate_limits
  where ip_hash = trim(p_ip_hash)
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > p_now then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_row.blocked_until-p_now)))::integer));
  end if;

  if p_now >= v_row.window_started_at + v_window then
    update private.order_rate_limits
      set window_started_at=p_now, request_count=1, blocked_until=null
      where ip_hash=trim(p_ip_hash);
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if v_row.request_count >= v_limit then
    update private.order_rate_limits
      set blocked_until=v_row.window_started_at + v_window
      where ip_hash=trim(p_ip_hash);
    return jsonb_build_object('allowed', false, 'retry_after_seconds', greatest(1, ceil(extract(epoch from ((v_row.window_started_at+v_window)-p_now)))::integer));
  end if;

  update private.order_rate_limits
    set request_count=request_count+1
    where ip_hash=trim(p_ip_hash);

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.check_order_rate_limit(text,timestamptz) from public, anon, authenticated;
grant execute on function public.check_order_rate_limit(text,timestamptz) to service_role;