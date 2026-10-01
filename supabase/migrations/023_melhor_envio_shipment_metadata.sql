-- Melhor Envio metadata for shipment reconciliation

alter table public.shipments
  add column if not exists melhor_envio_order_id text,
  add column if not exists melhor_envio_tracking_status text,
  add column if not exists label_url text;

create index if not exists shipments_melhor_envio_order_id_idx
  on public.shipments (melhor_envio_order_id)
  where melhor_envio_order_id is not null;

drop function if exists public.save_order_shipment_service(uuid,uuid,text,text,text,text);

create or replace function public.save_order_shipment_service(
  p_order_id uuid,
  p_owner_id uuid,
  p_tracking_code text,
  p_carrier text,
  p_service text,
  p_tracking_url text,
  p_melhor_envio_order_id text default null,
  p_label_url text default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_shipment public.shipments;
begin
  if p_owner_id is null or p_owner_id <> auth.uid() then
    raise exception 'Não autorizado';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and owner_id = p_owner_id for update;

  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status in ('CANCELLED','REFUNDED','DELIVERED') then
    raise exception 'Pedido não pode receber alterações de envio';
  end if;

  insert into public.shipments(
    order_id, carrier, service, tracking_code, tracking_url,
    shipping_status, melhor_envio_order_id, label_url, updated_at
  ) values (
    p_order_id, nullif(trim(p_carrier),''), nullif(trim(p_service),''),
    nullif(trim(p_tracking_code),''), nullif(trim(p_tracking_url),''),
    case when nullif(trim(p_tracking_code),'') is null then 'pending' else 'posted' end,
    nullif(trim(p_melhor_envio_order_id),''), nullif(trim(p_label_url),''), now()
  )
  on conflict (order_id) do update set
    carrier = excluded.carrier,
    service = excluded.service,
    tracking_code = excluded.tracking_code,
    tracking_url = excluded.tracking_url,
    shipping_status = case
      when excluded.tracking_code is null then public.shipments.shipping_status
      else excluded.shipping_status
    end,
    melhor_envio_order_id = coalesce(excluded.melhor_envio_order_id, public.shipments.melhor_envio_order_id),
    label_url = coalesce(excluded.label_url, public.shipments.label_url),
    updated_at = now()
  returning * into v_shipment;

  if nullif(trim(p_tracking_code),'') is not null and v_order.status = 'READY_TO_SHIP' then
    update public.orders
      set status = 'SHIPPED', stock_reserved = false, updated_at = now()
      where id = p_order_id;
  end if;

  return v_shipment;
end;
$$;

revoke execute on function public.save_order_shipment_service(uuid,uuid,text,text,text,text,text,text) from anon, public;
grant execute on function public.save_order_shipment_service(uuid,uuid,text,text,text,text,text,text) to authenticated;
