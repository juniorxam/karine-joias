import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = Deno.env.get("MELHOR_ENVIO_TOKEN");
    const userAgent = Deno.env.get("MELHOR_ENVIO_USER_AGENT");
    if (!url || !serviceKey || !token || !userAgent) return json({ error: "Melhor Envio não configurado no servidor" }, 503);

    const admin = createClient(url, serviceKey);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);

    const body = await req.json();
    const orderId = String(body.order_id || "");
    if (!orderId) return json({ error: "Pedido inválido" }, 400);

    const { data: order } = await admin
      .from("orders")
      .select("id,owner_id,order_number,status")
      .eq("id", orderId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!order) return json({ error: "Pedido não encontrado" }, 404);

    const { data: shipment, error: shipmentError } = await admin
      .from("shipments")
      .select("id,melhor_envio_order_id,tracking_code,shipping_status,melhor_envio_tracking_status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (shipmentError || !shipment) return json({ error: "Envio não encontrado" }, 404);
    if (!shipment.melhor_envio_order_id) return json({ error: "Este envio não possui ID do Melhor Envio" }, 400);

    const response = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/tracking", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify({ orders: [String(shipment.melhor_envio_order_id)] }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Melhor Envio tracking:", response.status, result);
      return json({ error: "Não foi possível consultar o rastreio no Melhor Envio" }, 502);
    }

    const raw = Array.isArray(result) ? result[0] : (result?.[shipment.melhor_envio_order_id] || result);
    const status = String(raw?.status || raw?.shipping_status || "").toLowerCase();
    const tracking = String(raw?.tracking || raw?.tracking_code || shipment.tracking_code || "").trim() || null;
    const carrier = String(raw?.company?.name || raw?.company || "").trim() || null;
    const delivered = ["delivered", "entregue"].includes(status);

    const { data: updatedShipment, error: updateError } = await admin
      .from("shipments")
      .update({
        melhor_envio_tracking_status: status || shipment.melhor_envio_tracking_status,
        shipping_status: status || shipment.shipping_status || "pending",
        tracking_code: tracking,
        carrier,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    if (delivered && order.status === "SHIPPED") {
      await admin.from("orders").update({
        status: "DELIVERED",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).eq("owner_id", user.id).eq("status", "SHIPPED");
    }

    return json({ shipment: updatedShipment, order_status: delivered ? "DELIVERED" : order.status });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro ao sincronizar rastreio" }, 500);
  }
});
