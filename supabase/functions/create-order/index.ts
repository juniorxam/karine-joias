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
    const customer = body.customer || {};
    const shipping = body.shipping || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const couponCode = String(body.coupon_code || "").trim().toUpperCase();

    if (items.length < 1 || items.length > 30) throw new Error("Carrinho inválido");
    if (!customer.name || String(customer.name).trim().length < 2) throw new Error("Nome inválido");

    const email = String(customer.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido");
    if (!customer.phone || String(customer.phone).replace(/\D/g, "").length < 10) throw new Error("Telefone inválido");

    const recipientCode = String(customer.recipient_code || shipping.recipient_code || "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(recipientCode)) throw new Error("CPF inválido");

    const quoteId = String(shipping.shipping_quote_id || "");
    const selectedOptionId = String(shipping.shipping_option?.id ?? "");
    if (!quoteId || !selectedOptionId) throw new Error("Frete inválido");

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Servidor não configurado");

    const db = createClient(url, key);

    const { data: quote, error: quoteError } = await db
      .from("shipping_quotes")
      .select("id,owner_id,items,options,expires_at")
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) throw new Error("Cotação de frete não encontrada");
    if (!quote.owner_id) throw new Error("Cotação de frete incompatível com a loja");
    if (new Date(quote.expires_at).getTime() <= Date.now()) throw new Error("A cotação de frete expirou");

    const quoteItems = Array.isArray(quote.items) ? quote.items : [];
    const normalizedItems = items.map((item: any) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
    })).sort((a: any, b: any) => a.product_id - b.product_id);

    const normalizedQuoteItems = quoteItems.map((item: any) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
    })).sort((a: any, b: any) => a.product_id - b.product_id);

    if (JSON.stringify(normalizedItems) !== JSON.stringify(normalizedQuoteItems)) {
      throw new Error("A cotação de frete não corresponde ao carrinho");
    }

    const options = Array.isArray(quote.options) ? quote.options : [];
    const selectedOption = options.find((option: any) => String(option.id) === selectedOptionId);
    if (!selectedOption) throw new Error("Opção de frete inválida");

    const shippingAmount = Math.max(0, Number(selectedOption.price) || 0);

    const { data: owners, error: ownersError } = await db
      .from("products")
      .select("id,owner_id")
      .in("id", normalizedItems.map((item: any) => item.product_id));

    if (ownersError || !owners || owners.length !== normalizedItems.length) throw new Error("Produto não encontrado");
    const ownerIds = [...new Set(owners.map((product: any) => String(product.owner_id || "")))];
    if (ownerIds.length !== 1 || ownerIds[0] !== String(quote.owner_id)) {
      throw new Error("A cotação não pertence aos produtos do pedido");
    }
    const ownerId = ownerIds[0];

    const { data, error } = await db.rpc("create_store_order_service", {
      p_owner_id: ownerId,
      p_customer: {
        name: String(customer.name).trim(),
        email,
        phone: String(customer.phone).trim(),
        recipient_code: recipientCode,
      },
      p_shipping: {
        ...shipping,
        recipient_code: recipientCode,
        shipping_option: selectedOption,
      },
      p_items: items,
      p_shipping_amount: shippingAmount,
      p_payment_method: "PENDING",
      p_coupon_code: couponCode || null,
    });

    if (error) throw error;

    const order = Array.isArray(data) ? data[0] : data;
    if (!order?.id) throw new Error("Pedido não criado");

    // Token aleatório para o cliente consultar o próprio pedido sem login.
    const trackingToken = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const trackingTokenHash = await sha256(trackingToken);
    const { error: trackingError } = await db
      .from("orders")
      .update({
        tracking_token_hash: trackingTokenHash,
        tracking_token_created_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (trackingError) throw trackingError;

    return new Response(JSON.stringify({ ...order, tracking_token: trackingToken }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Erro ao criar pedido",
    }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
