import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let admin: ReturnType<typeof createClient> | null = null;
  let claimedOrderId: string | null = null;
  let claimToken: string | null = null;
  try {
    const body = await req.json();
    const orderNumber = String(body?.order_number ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!orderNumber || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Pedido e e-mail válido são obrigatórios" }, 400);

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const handle = (Deno.env.get("INFINITEPAY_HANDLE") || "violettaprataesemijoias").replace(/^\$/, "").trim();
    const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://violetta.com.br").replace(/\/$/, "");
    if (!serviceKey || !supabaseUrl || !handle || !siteUrl) return json({ error: "InfinitePay ainda não está configurada no servidor" }, 503);

    admin = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,order_number,customer_name,customer_email,customer_phone,shipping_address,total_amount,shipping_amount,discount_amount,status,payment_status,payment_provider,payment_provider_id,payment_url")
      .eq("order_number", orderNumber).eq("customer_email", email).maybeSingle();
    if (orderError || !order) return json({ error: "Pedido não encontrado" }, 404);
    if (String(order.payment_status).toUpperCase() === "PAID") return json({ error: "Este pedido já foi pago" }, 409);
    if (["CANCELLED", "REFUNDED"].includes(String(order.status).toUpperCase())) return json({ error: "Este pedido não pode receber pagamento" }, 409);
    if (String(order.payment_provider || "").toLowerCase() === "infinitepay" && order.payment_url && String(order.payment_status).toUpperCase() === "PENDING") {
      return json({ url: order.payment_url, reused: true });
    }
    if (String(order.payment_provider || "").toLowerCase() === "mercadopago" && order.payment_provider_id) {
      return json({ error: "Este pedido já possui um pagamento iniciado no Mercado Pago. Para evitar cobrança duplicada, solicite à loja a atualização do link." }, 409);
    }

    claimToken = crypto.randomUUID();
    const { data: claimed, error: claimError } = await admin.from("orders").update({
      payment_creation_token: claimToken,
      payment_creation_started_at: new Date().toISOString(),
    }).eq("id", order.id).eq("payment_status", "PENDING").is("payment_provider_id", null)
      .or("payment_creation_token.is.null,payment_creation_started_at.lt." + new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .select("id").maybeSingle();
    if (claimError) {
      console.error("Falha ao reservar criação do checkout InfinitePay", claimError);
      return json({ error: "Não foi possível iniciar o pagamento" }, 500);
    }
    if (!claimed) return json({ error: "O pagamento está sendo preparado. Aguarde alguns segundos e tente novamente." }, 409);
    claimedOrderId = order.id;

    const releaseClaim = async () => {
      if (!admin || !claimedOrderId || !claimToken) return;
      const { error } = await admin.from("orders").update({ payment_creation_token: null, payment_creation_started_at: null })
        .eq("id", claimedOrderId).eq("payment_creation_token", claimToken);
      if (error) console.error("Falha ao liberar reserva do checkout", error);
      else claimToken = null;
    };

    const { data: items, error: itemsError } = await admin.from("order_items")
      .select("product_name,quantity,unit_price").eq("order_id", order.id);
    if (itemsError || !items?.length) {
      await releaseClaim();
      return json({ error: "Itens do pedido não encontrados" }, 400);
    }

    const itemsTotalCents = items.reduce((sum, item) => sum + Math.round(Number(item.unit_price) * 100) * Number(item.quantity), 0);
    const discountCents = Math.max(0, Math.round(Number(order.discount_amount || 0) * 100));
    const shippingCents = Math.max(0, Math.round(Number(order.shipping_amount || 0) * 100));
    const expectedCents = Math.round(Number(order.total_amount) * 100);
    if (itemsTotalCents - discountCents + shippingCents !== expectedCents || discountCents > itemsTotalCents) {
      await releaseClaim();
      console.error("Total do pedido inconsistente", { orderNumber, itemsTotalCents, discountCents, shippingCents, expectedCents });
      return json({ error: "O total do pedido não confere. Entre em contato com a loja antes de pagar." }, 409);
    }

    let remainingDiscount = discountCents;
    const paymentItems: Array<{ quantity: number; price: number; description: string }> = [];
    const addItem = (quantity: number, price: number, description: string) => {
      if (quantity > 0 && price > 0) paymentItems.push({ quantity, price, description: String(description).slice(0, 120) });
    };
    for (const item of items) {
      const quantity = Number(item.quantity);
      const unitCents = Math.round(Number(item.unit_price) * 100);
      const lineCents = unitCents * quantity;
      const lineDiscount = Math.min(remainingDiscount, lineCents);
      const adjusted = lineCents - lineDiscount;
      const base = Math.floor(adjusted / quantity);
      const remainder = adjusted - base * quantity;
      addItem(remainder, base + 1, String(item.product_name));
      addItem(quantity - remainder, base, String(item.product_name));
      remainingDiscount -= lineDiscount;
    }
    if (remainingDiscount > 0) {
      await releaseClaim();
      return json({ error: "Não foi possível distribuir o desconto do pedido" }, 409);
    }
    if (shippingCents > 0) addItem(1, shippingCents, "Frete");
    const payloadTotal = paymentItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
    if (payloadTotal !== expectedCents || !paymentItems.length) {
      await releaseClaim();
      return json({ error: "Não foi possível validar o total para pagamento" }, 409);
    }

    const shipping = order.shipping_address && typeof order.shipping_address === "object" ? order.shipping_address as Record<string, unknown> : {};
    const customer: Record<string, unknown> = { name: order.customer_name, email: order.customer_email };
    const phone = String(order.customer_phone || "").replace(/\D/g, "");
    if (phone.length >= 10 && phone.length <= 13) customer.phone_number = phone.startsWith("55") ? "+" + phone : "+55" + phone;
    const address: Record<string, unknown> = {};
    const cep = String(shipping.postal_code || "").replace(/\D/g, "");
    if (cep.length === 8) address.cep = cep;
    for (const key of ["address", "neighborhood", "number", "complement"] as const) {
      const value = String(shipping[key] || "").trim();
      if (value) address[key === "address" ? "street" : key] = value.slice(0, 120);
    }

    const response = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        handle, order_nsu: order.order_number,
        redirect_url: siteUrl + "/loja/pedido",
        webhook_url: supabaseUrl + "/functions/v1/infinitepay-webhook",
        items: paymentItems,
        customer,
        ...(Object.keys(address).length ? { address } : {}),
      }),
    });
    const result = await response.json().catch(() => ({}));
    const checkoutUrl = String(result?.url || "");
    if (!response.ok || !/^https:\/\//i.test(checkoutUrl)) {
      console.error("InfinitePay link creation failed", response.status, result?.message || result?.error || "invalid response");
      await releaseClaim();
      return json({ error: "A InfinitePay não conseguiu gerar o link agora. Tente novamente em instantes." }, 502);
    }

    const { data: saved, error: saveError } = await admin.from("orders").update({
      payment_provider: "infinitepay",
      payment_provider_id: order.order_number,
      payment_url: checkoutUrl,
      payment_method: "infinitepay",
      payment_creation_token: null,
      payment_creation_started_at: null,
    }).eq("id", order.id).eq("payment_creation_token", claimToken).select("id").maybeSingle();
    if (saveError || !saved) {
      console.error("InfinitePay link created but could not be persisted", saveError);
      return json({ error: "O link foi gerado, mas não conseguimos salvar o pagamento com segurança. Não tente pagar novamente; contate a loja." }, 500);
    }
    claimToken = null;
    return json({ url: checkoutUrl });
  } catch (error) {
    console.error("InfinitePay checkout error", error);
    if (admin && claimedOrderId && claimToken) {
      await admin.from("orders").update({ payment_creation_token: null, payment_creation_started_at: null })
        .eq("id", claimedOrderId).eq("payment_creation_token", claimToken);
    }
    return json({ error: "Não foi possível preparar o pagamento. Tente novamente em instantes." }, 500);
  }
});
