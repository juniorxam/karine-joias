-- Order admin RPCs do not need SECURITY DEFINER because their target tables
-- already enforce owner-scoped RLS policies. Keep the RPCs subject to caller RLS.

alter function public.update_order_status_service(uuid,uuid,text)
  security invoker;

alter function public.cancel_order_admin_service(uuid,uuid)
  security invoker;

alter function public.save_order_shipment_service(uuid,uuid,text,text,text,text,text,text)
  security invoker;
