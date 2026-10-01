import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: cors });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const mpToken = Deno.env.get("MP_ACCESS_TOKEN") || "";
    if (!supabaseUrl || !serviceKey || !mpToken) {
      return new Response(JSON.stringify({ error: "Serviço de pagamento não configurado" }), { status: 503, headers: cors });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: cors });
    }

    const body = await req.json();
    const orderId = String(body?.order_id || "");
    if (!orderId) return new Response(JSON.stringify({ error: "Pedido inválido" }), { status: 400, headers: cors });

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,owner_id,status,payment_status,payment_provider,payment_provider_id,total_amount")
      .eq("id", orderId)
      .eq("owner_id", user.id)
      .single();

    if (orderError || !order) return new Response(JSON.stringify({ error: "Pedido não encontrado" }), { status: 404, headers: cors });
    if (order.payment_provider !== "mercadopago" || !order.payment_provider_id) {
      return new Response(JSON.stringify({ error: "Pedido sem pagamento Mercado Pago reembolsável" }), { status: 400, headers: cors });
    }
    if (order.payment_status !== "PAID") {
      return new Response(JSON.stringify({ error: "Somente pedidos pagos podem ser reembolsados" }), { status: 409, headers: cors });
    }
    if (["CANCELLED", "REFUNDED"].includes(order.status)) {
      return new Response(JSON.stringify({ error: "Pedido já encerrado" }), { status: 409, headers: cors });
    }

    const refundRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(order.payment_provider_id)}/refunds`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      }
    );

    const refundBody = await refundRes.json().catch(() => ({}));
    if (!refundRes.ok) {
      console.error("Mercado Pago refund failed", refundRes.status, refundBody);
      return new Response(JSON.stringify({ error: "Mercado Pago recusou o reembolso", details: refundBody?.message || refundBody?.error || null }), { status: 502, headers: cors });
    }

    const { data: refunded, error: transitionError } = await admin.rpc("mark_order_refunded_service", {
      p_order_id: order.id,
      p_owner_id: user.id
    });

    if (transitionError || !refunded) {
      console.error("Refund succeeded but local transition failed", transitionError);
      return new Response(JSON.stringify({
        error: "Reembolso confirmado pelo Mercado Pago, mas a atualização local falhou. Verifique o pedido antes de tentar novamente.",
        refund_id: refundBody?.id || null
      }), { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({
      ok: true,
      refund_id: refundBody?.id || null,
      status: "REFUNDED"
    }), { status: 200, headers: cors });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Falha ao processar reembolso" }), { status: 500, headers: cors });
  }
});
