import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { order_number, email } = await req.json();
    if (!order_number || !email) {
      return Response.json({ error: "Pedido e e-mail são obrigatórios" }, { status: 400, headers: cors });
    }

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL");

    if (!serviceKey || !supabaseUrl || !accessToken || !siteUrl) {
      return Response.json({ error: "Pagamento ainda não configurado no servidor" }, { status: 503, headers: cors });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,customer_name,customer_email,total_amount,status,payment_status")
      .eq("order_number", order_number)
      .eq("customer_email", String(email).trim().toLowerCase())
      .single();

    if (orderError || !order) return Response.json({ error: "Pedido não encontrado" }, { status: 404, headers: cors });
    if (order.payment_status === "PAID") return Response.json({ error: "Este pedido já foi pago" }, { status: 409, headers: cors });

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("product_name,quantity,unit_price")
      .eq("order_id", order.id);

    if (itemsError || !items?.length) return Response.json({ error: "Itens do pedido não encontrados" }, { status: 400, headers: cors });

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: items.map((item) => ({
          title: item.product_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          currency_id: "BRL",
        })),
        payer: { name: order.customer_name, email: order.customer_email },
        external_reference: order.order_number,
        back_urls: {
          success: `${siteUrl}/loja/pedido?status=success&order=${encodeURIComponent(order.order_number)}`,
          pending: `${siteUrl}/loja/pedido?status=pending&order=${encodeURIComponent(order.order_number)}`,
          failure: `${siteUrl}/loja/pedido?status=failure&order=${encodeURIComponent(order.order_number)}`,
        },
        auto_return: "approved",
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      }),
    });

    const preference = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("Mercado Pago:", preference);
      return Response.json({ error: "Mercado Pago recusou a preferência" }, { status: 502, headers: cors });
    }

    await admin.from("orders").update({
      payment_provider: "mercadopago",
      payment_provider_id: preference.id,
      payment_url: preference.init_point,
      payment_status: "PENDING",
    }).eq("id", order.id);

    return Response.json({ init_point: preference.init_point, preference_id: preference.id }, { headers: cors });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Erro interno ao preparar pagamento" }, { status: 500, headers: cors });
  }
});
