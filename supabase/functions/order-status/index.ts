import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const orderNumber = String(body.order_number || "").trim();
    const token = String(body.token || "").trim();

    if (!orderNumber || token.length < 32) {
      return Response.json({ error: "Dados de rastreamento inválidos" }, { status: 400, headers: cors });
    }

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!serviceKey || !supabaseUrl) {
      return Response.json({ error: "Servidor não configurado" }, { status: 503, headers: cors });
    }

    const db = createClient(supabaseUrl, serviceKey);
    const tokenHash = await sha256(token);

    const { data: order, error } = await db
      .from("orders")
      .select("id,order_number,customer_name,total_amount,shipping_amount,payment_status,status,created_at,shipping_address")
      .eq("order_number", orderNumber)
      .eq("tracking_token_hash", tokenHash)
      .single();

    if (error || !order) {
      return Response.json({ error: "Pedido não encontrado" }, { status: 404, headers: cors });
    }

    const [{ data: items }, { data: shipment }, { data: history }] = await Promise.all([
      db.from("order_items").select("product_name,quantity,unit_price,total_price").eq("order_id", order.id),
      db.from("shipments").select("carrier,tracking_code,status,shipped_at,delivered_at").eq("order_id", order.id).maybeSingle(),
      db.from("order_status_history").select("from_status,to_status,created_at,note").eq("order_id", order.id).order("created_at", { ascending: true }),
    ]);

    return Response.json({
      order: {
        order_number: order.order_number,
        customer_name: order.customer_name,
        total_amount: order.total_amount,
        shipping_amount: order.shipping_amount,
        payment_status: order.payment_status,
        status: order.status,
        created_at: order.created_at,
        shipping_address: order.shipping_address,
      },
      items: items || [],
      shipment: shipment || null,
      history: history || [],
    }, { headers: cors });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Erro ao consultar pedido" }, { status: 500, headers: cors });
  }
});
