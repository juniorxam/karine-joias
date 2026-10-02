-- Harden privileged order functions against search_path manipulation.
-- The function bodies already qualify public tables explicitly.

alter function public.update_order_status_service(uuid,uuid,text)
  set search_path = '';

alter function public.cancel_order_admin_service(uuid,uuid)
  set search_path = '';

alter function public.save_order_shipment_service(uuid,uuid,text,text,text,text,text,text)
  set search_path = '';
