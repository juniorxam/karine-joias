import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const postalCode = String(body.postal_code || "").replace(/\D/g, "");
    const items = Array.isArray(body.items) ? body.items : [];

    if (!/^\d{8}$/.test(postalCode)) throw new Error("CEP inválido");
    if (!items.length || items.length > 30) throw new Error("Carrinho inválido");

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const melhorEnvioToken = Deno.env.get("MELHOR_ENVIO_TOKEN");
    const userAgent = Deno.env.get("MELHOR_ENVIO_USER_AGENT");

    if (!serviceKey || !supabaseUrl || !melhorEnvioToken || !userAgent) {
      return Response.json({ error: "Frete ainda não configurado no servidor" }, { status: 503, headers: cors });
    }

    const db = createClient(supabaseUrl, serviceKey);
    const productIds = items.map((item: any) => Number(item.product_id)).filter(Number.isInteger);
    if (productIds.length !== items.length) throw new Error("Produto inválido");

    const { data: products, error: productsError } = await db
      .from("products")
      .select("id,name,price,weight_grams,package_height_cm,package_width_cm,package_length_cm,active")
      .in("id", productIds);

    if (productsError || !products || products.length !== productIds.length) throw new Error("Produtos não encontrados");
    if (products.some((p: any) => p.active === false)) throw new Error("Um dos produtos não está disponível");

    const originSetting = await db
      .from("store_settings")
      .select("value")
      .eq("key", "shipping_origin_postal_code")
      .maybeSingle();

    const origin = String(originSetting.data?.value || "77001540").replace(/\D/g, "");
    if (!/^\d{8}$/.test(origin)) throw new Error("CEP de origem da loja inválido");

    const productMap = new Map(products.map((p: any) => [Number(p.id), p]));
    let weight = 0;
    let quantity = 0;
    const shippingProducts: any[] = [];

    for (const item of items) {
      const product = productMap.get(Number(item.product_id));
      const qty = Number(item.quantity);
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error("Quantidade inválida");

      const weightKg = Math.max(0.1, Number(product.weight_grams || 200) / 1000);
      const width = Math.max(1, Number(product.package_width_cm || 10));
      const height = Math.max(1, Number(product.package_height_cm || 5));
      const length = Math.max(1, Number(product.package_length_cm || 15));
      const unitValue = Math.max(0, Number(product.price || 0));

      weight += weightKg * qty;
      quantity += qty;
      shippingProducts.push({
        id: String(product.id),
        name: String(product.name || `Produto ${product.id}`),
        quantity: qty,
        weight: weightKg,
        width,
        height,
        length,
        insurance_value: unitValue,
      });
    }

    // A API espera os produtos em lista; o peso é informado em kg.
    const payload = {
      from: { postal_code: origin },
      to: { postal_code: postalCode },
      products: shippingProducts,
    };

    const response = await fetch("https://www.melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${melhorEnvioToken}`,
        "Content-Type": "application/json",
        "User-Agent": userAgent,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Melhor Envio:", response.status, result);
      return Response.json({ error: "Não foi possível calcular o frete agora" }, { status: 502, headers: cors });
    }

    const options = (Array.isArray(result) ? result : [])
      .filter((option: any) => option && option.id && Number(option.price) >= 0 && !option.error)
      .map((option: any) => ({
        id: option.id,
        company: option.company?.name || "Transportadora",
        service: option.name || option.service || "Envio",
        price: Number(option.custom_price ?? option.price),
        delivery_time: Number(option.custom_delivery_time || option.delivery_time || 0),
      }));

    if (!options.length) throw new Error("Nenhuma opção de frete disponível");

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: quote, error: quoteError } = await db
      .from("shipping_quotes")
      .insert({
        postal_code: postalCode,
        items,
        destination: { postal_code: postalCode },
        options,
        expires_at: expiresAt,
      })
      .select("id,expires_at")
      .single();

    if (quoteError || !quote) throw new Error("Não foi possível salvar a cotação");

    return Response.json({
      quote_id: quote.id,
      expires_at: quote.expires_at,
      options,
      package: { weight_kg: weight, quantity } ,
    }, { headers: cors });
  } catch (error) {
    console.error(error);
    return Response.json({
      error: error instanceof Error ? error.message : "Erro ao calcular frete",
    }, { status: 400, headers: cors });
  }
});
