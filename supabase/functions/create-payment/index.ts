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

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL");

    if (!serviceKey || !supabaseUrl || !accessToken || !siteUrl) {
      return Response.json({ error: "Pagamento ainda não configurado no servidor" }, { status: 503, headers: cors });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,customer_name,customer_email,total_amount,shipping_amount,discount_amount,status,payment_status")
      .eq("order_number", order_number)
      .eq("customer_email", String(email).trim().toLowerCase())
      .single();

    if (orderError || !order) return Response.json({ error: "Pedido não encontrado" }, { status: 404, headers: cors });
    if (order.payment_status === "PAID") return Response.json({ error: "Este pedido já foi pago" }, { status: 409, headers: cors });
    if (["CANCELLED", "REFUNDED"].includes(String(order.status))) {
      return Response.json({ error: "Este pedido não pode receber pagamento" }, { status: 409, headers: cors });
    }

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("product_name,quantity,unit_price")
      .eq("order_id", order.id);

    if (itemsError || !items?.length) return Response.json({ error: "Itens do pedido não encontrados" }, { status: 400, headers: cors });

    const itemsTotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
    const discountAmount = Math.max(0, Number(order.discount_amount || 0));
    const expectedTotal = itemsTotal - discountAmount + Number(order.shipping_amount || 0);
    if (Math.abs(expectedTotal - Number(order.total_amount)) > 0.01) {
      console.error("Pedido com total inconsistente", { order: order.order_number, expectedTotal, total: order.total_amount });
      return Response.json({ error: "Total do pedido inconsistente" }, { status: 409, headers: cors });
    }

    // O Checkout Pro soma os itens enviados. Para preservar exatamente o total do pedido
    // com cupom, distribuímos o desconto nas unidades dos produtos, sem enviar preços negativos.
    let remainingDiscountCents = Math.round(discountAmount * 100);
    const paymentItems: Array<{ title: string; quantity: number; unit_price: number; currency_id: string }> = [];
    for (const item of items) {
      const quantity = Number(item.quantity);
      const originalUnitCents = Math.round(Number(item.unit_price) * 100);
      if (remainingDiscountCents <= 0) {
        paymentItems.push({ title: item.product_name, quantity, unit_price: originalUnitCents / 100, currency_id: "BRL" });
        continue;
      }
      const lineCents = originalUnitCents * quantity;
      const lineDiscount = Math.min(remainingDiscountCents, lineCents);
      const adjustedLineCents = lineCents - lineDiscount;
      const baseUnitCents = Math.floor(adjustedLineCents / quantity);
      let remainder = adjustedLineCents - baseUnitCents * quantity;
      for (let unit = 0; unit < quantity; unit++) {
        const unitCents = baseUnitCents + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        paymentItems.push({ title: item.product_name, quantity: 1, unit_price: unitCents / 100, currency_id: "BRL" });
      }
      remainingDiscountCents -= lineDiscount;
    }
    if (remainingDiscountCents > 0) return Response.json({ error: "Desconto do pedido excede o valor dos produtos" }, { status: 409, headers: cors });

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          ...paymentItems,
          ...(Number(order.shipping_amount) > 0 ? [{
            title: "Frete",
            quantity: 1,
            unit_price: Number(order.shipping_amount),
            currency_id: "BRL",
          }] : []),
        ],
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
