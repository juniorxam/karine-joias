import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const text = (value: unknown, field: string, min: number, max: number) => {
  const result = String(value ?? "").trim();
  if (result.length < min || result.length > max) throw new Error(`${field} inválido`);
  return result;
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^([0-9])\1{10}$/.test(value)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(value[index]) * (length + 1 - index);
    const digit = (sum * 10) % 11;
    return digit === 10 ? 0 : digit;
  };
  return calculate(9) === Number(value[9]) && calculate(10) === Number(value[10]);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getClientOrigin(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    forwarded ||
    "unknown"
  );
}

async function geocodeAddress(query: string, apiKey: string) {
  const url = "https://api.heigit.org/pelias/v1/search?text=" + encodeURIComponent(query) + "&boundary.country=BR&size=1";
  const response = await fetch(url, { headers: { "Authorization": apiKey, "Accept": "application/json" } });
  if (!response.ok) throw new Error("Não foi possível localizar um dos endereços no mapa. Confira o CEP e o endereço.");
  const data = await response.json();
  const coordinates = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error("O mapa não encontrou coordenadas para este endereço. Confira o CEP e o endereço.");
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error("O mapa retornou coordenadas inválidas para este endereço.");
  return [lon, lat] as [number, number];
}

async function routeDistanceKm(originQuery: string, destinationQuery: string) {
  const apiKey = Deno.env.get("ORS_API_KEY");
  if (!apiKey) throw new Error("O cálculo de rotas ainda não está configurado no servidor (ORS_API_KEY).");
  const [origin, destination] = await Promise.all([
    geocodeAddress(originQuery, apiKey),
    geocodeAddress(destinationQuery, apiKey),
  ]);
  const response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/driving-car", {
    method: "POST",
    headers: { "Authorization": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ coordinates: [origin, destination], instructions: false }),
  });
  if (!response.ok) throw new Error("Não foi possível calcular a rota pelas ruas. Tente novamente ou combine a entrega com a loja.");
  const data = await response.json();
  const meters = Number(data?.routes?.[0]?.summary?.distance);
  if (!Number.isFinite(meters) || meters <= 0) throw new Error("Não foi possível obter a distância da rota.");
  return Number((meters / 1000).toFixed(1));
}

function buildOriginQuery(postalCode: string) {
  const cep = postalCode.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) throw new Error("O CEP de origem da loja não está configurado corretamente.");
  return cep + ", Palmas, Tocantins, Brasil";
}

function buildConfirmedOriginQuery(settings: any) {
  const postalCode = digits(settings?.shipping_origin_draft_postal_code);
  const street = String(settings?.shipping_origin_draft_street || "").trim();
  const number = String(settings?.shipping_origin_draft_number || "").trim();
  const city = String(settings?.shipping_origin_draft_city || "").trim();
  const state = String(settings?.shipping_origin_draft_state || "").trim().toUpperCase();
  if (!street || !number || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{8}$/.test(postalCode)) {
    throw new Error("O endereço de origem ativado está incompleto. Revise as configurações de entrega.");
  }
  return [street, number, settings?.shipping_origin_draft_neighborhood, city, state, postalCode, "Brasil"]
    .map((value) => String(value ?? "").trim()).filter(Boolean).join(", ");
}

function buildDestinationQuery(shipping: any) {
  const cep = String(shipping.postal_code || "").replace(/\D/g, "");
  const parts = [
    shipping.address,
    shipping.number,
    shipping.neighborhood,
    shipping.city,
    shipping.state,
    cep,
    "Brasil",
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (parts.length < 5) throw new Error("Endereço incompleto para calcular a rota.");
  return parts.join(", ");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Servidor não configurado");

    const origin = getClientOrigin(req);
    const originHash = await sha256(`${key}:${origin}`);
    const rateDb = createClient(url, key);
    const db = rateDb;
    let customerUserId: string | null = null;
    const authorization = req.headers.get("authorization") || "";
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (bearer && anonKey) {
      try {
        const authClient = createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
        });
        const { data: authUser } = await authClient.auth.getUser(bearer);
        customerUserId = authUser.user?.id || null;
      } catch {
        customerUserId = null;
      }
    }
    const { data: rateLimit, error: rateLimitError } = await rateDb.rpc("check_order_rate_limit", {
      p_ip_hash: originHash,
    });
    if (rateLimitError) {
      console.error("Falha no rate limit do checkout", rateLimitError);
      return new Response(JSON.stringify({ error: "Não foi possível iniciar o pedido agora. Tente novamente." }), {
        status: 503,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (rateLimit?.allowed === false) {
      const retryAfter = Number(rateLimit.retry_after_seconds || 60);
      return new Response(JSON.stringify({ error: "Muitas tentativas de checkout. Aguarde alguns minutos e tente novamente." }), {
        status: 429,
        headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(retryAfter) },
      });
    }

    const body = await req.json();
    const customer = body.customer || {};
    const shipping = body.shipping || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const couponCode = String(body.coupon_code || "").trim().toUpperCase();
    const idempotencyKey = String(body.idempotency_key || "").trim();

    if (items.length < 1 || items.length > 30) throw new Error("Carrinho inválido");
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(idempotencyKey)) throw new Error("Chave de checkout inválida");

    const customerName = text(customer.name, "Nome", 2, 120);
    const email = text(customer.email, "E-mail", 5, 180).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido");
    const phone = digits(customer.phone);
    if (!/^\d{10,13}$/.test(phone)) throw new Error("Telefone inválido");

    const recipientCode = digits(customer.recipient_code || shipping.recipient_code);
    if (!isValidCpf(recipientCode)) throw new Error("CPF inválido");

    const postalCode = digits(shipping.postal_code);
    const pickupSelected = String(shipping.shipping_option?.service || "").trim() === "Retirada no local";
    const address = pickupSelected ? String(shipping.address || "").trim().slice(0, 180) : text(shipping.address, "Logradouro", 2, 180);
    const number = pickupSelected ? String(shipping.number || "").trim().slice(0, 30) : text(shipping.number, "Número", 1, 30);
    const neighborhood = pickupSelected ? String(shipping.neighborhood || "").trim().slice(0, 100) : text(shipping.neighborhood, "Bairro", 2, 100);
    const city = pickupSelected ? String(shipping.city || "").trim().slice(0, 100) : text(shipping.city, "Cidade", 2, 100);
    const state = String(shipping.state || "").trim().toUpperCase().slice(0, 2);
    const complement = String(shipping.complement || "").trim().slice(0, 120);
    if (!/^\d{8}$/.test(postalCode)) throw new Error("CEP inválido");
    if (!pickupSelected && (!address || !number || !neighborhood || !city || !/^[A-Z]{2}$/.test(state))) throw new Error("Endereço inválido");
    if (pickupSelected && (!city || !/^[A-Z]{2}$/.test(state))) throw new Error("Localidade inválida");

    const requestedService = String(shipping.shipping_option?.service || "").trim();
    const pricingItems = items.map((item: any) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) }));
    if (pricingItems.some((item: any) => !Number.isSafeInteger(item.product_id) || item.product_id < 1 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) throw new Error("Item inválido");
    const { data: pricingProducts, error: pricingError } = await db.from("products").select("id,price,active,owner_id").in("id", pricingItems.map((item: any) => item.product_id));
    if (pricingError || !pricingProducts || pricingProducts.length !== pricingItems.length || pricingProducts.some((product: any) => product.active === false)) throw new Error("Produto não encontrado");
    const pricingOwners = [...new Set(pricingProducts.map((product: any) => String(product.owner_id || "")))];
    if (pricingOwners.length !== 1 || !pricingOwners[0]) throw new Error("Produtos de lojas diferentes não podem ser combinados");
    const subtotal = pricingProducts.reduce((sum: number, product: any) => sum + (Number(product.price) || 0) * (pricingItems.find((item: any) => item.product_id === Number(product.id))?.quantity || 0), 0);
    const normalizedCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const isPalmas = normalizedCity === "PALMAS" && state === "TO";
    let shippingAmount = 0;
    let normalizedShippingOption: any;

    if (isPalmas) {
      const { data: storeSettings, error: settingsError } = await db.from("storefront_settings")
        .select("shipping_palmas_enabled,shipping_palmas_pickup_enabled,shipping_origin_postal_code,shipping_palmas_distance_rules,shipping_origin_address_confirmed,shipping_origin_draft_postal_code,shipping_origin_draft_street,shipping_origin_draft_number,shipping_origin_draft_neighborhood,shipping_origin_draft_city,shipping_origin_draft_state")
        .eq("store_slug", "violetta").maybeSingle();
      if (settingsError) throw settingsError;
      if (pickupSelected) {
        if (storeSettings?.shipping_palmas_pickup_enabled !== true) throw new Error("A retirada no local está desativada.");
        if (city.toLowerCase() !== "palmas" || state !== "TO") throw new Error("A retirada no local está disponível somente em Palmas-TO.");
        normalizedShippingOption = { id: "violetta-pickup", company: "Violetta", service: "Retirada no local", price: 0, delivery_time: 0 };
      } else if (storeSettings?.shipping_palmas_enabled) {
        const quoteUrl = url.replace(/\/$/, "") + "/functions/v1/calculate-shipping";
        const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || key;
        const quoteResponse = await fetch(quoteUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": publicKey, "Authorization": "Bearer " + publicKey },
          body: JSON.stringify({ shipping: { ...shipping, postal_code: postalCode, address, number, neighborhood, city, state }, subtotal }),
          signal: AbortSignal.timeout(25_000),
        });
        const quote = await quoteResponse.json().catch(() => ({}));
        if (!quoteResponse.ok || quote?.error) throw new Error(String(quote?.error || "Não foi possível validar o frete. Tente novamente."));
        const distance = Number(quote.distance_km);
        if (!Number.isFinite(distance) || distance <= 0) throw new Error("O serviço de frete retornou uma distância inválida.");
        if (quote.serviceable !== true || distance > 20 || quote.shipping_price === null) {
          if (requestedService !== "Frete a combinar") throw new Error("Este endereço fica fora do raio de 20 km. Selecione Frete a combinar para negociar a entrega com a loja.");
          shippingAmount = 0;
          normalizedShippingOption = { id: "palmas-combine", company: "Violetta", service: "Frete a combinar", price: 0, delivery_time: 0 };
        } else {
          if (requestedService === "Frete a combinar") throw new Error("Este endereço está dentro do raio de entrega automática. Recalcule e selecione o frete exibido pela loja.");
          const serverPrice = Number(quote.shipping_price);
          if (!Number.isFinite(serverPrice) || serverPrice < 0) throw new Error("O valor de frete retornado pelo servidor é inválido.");
          shippingAmount = Math.round(serverPrice * 100) / 100;
          normalizedShippingOption = { id: "palmas-server-quote", company: "Violetta", service: String(quote.service || ("Entrega em Palmas · " + distance.toFixed(1) + " km")), price: shippingAmount, delivery_time: Number(quote.estimated_duration_minutes || 0) };
        }
      } else {
        if (requestedService !== "Frete a combinar") throw new Error("O cálculo automático de frete de Palmas está desativado.");
        normalizedShippingOption = { id: "palmas-combine", company: "Violetta", service: "Frete a combinar", price: 0, delivery_time: 0 };
      }
    } else {
      if (requestedService !== "Frete a combinar") throw new Error("Para este endereço, o frete será negociado diretamente com a loja.");
      normalizedShippingOption = { id: "outside-palmas", company: "Violetta", service: "Frete a combinar", price: 0, delivery_time: 0 };
    }

    const normalizedItems = items.map((item: any) => {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new Error("Item inválido");
      }
      return { product_id: productId, quantity };
    }).sort((a: any, b: any) => a.product_id - b.product_id);
    if (new Set(normalizedItems.map((item: any) => item.product_id)).size !== normalizedItems.length) throw new Error("Produto repetido no carrinho");

    const { data: products, error: productsError } = await db
      .from("products")
      .select("id,owner_id,active")
      .in("id", normalizedItems.map((item: any) => item.product_id));
    if (productsError || !products || products.length !== normalizedItems.length) throw new Error("Produto não encontrado");
    if (products.some((product: any) => product.active === false)) throw new Error("Um dos produtos não está disponível");
    const ownerIds = [...new Set(products.map((product: any) => String(product.owner_id || "")))];
    if (ownerIds.length !== 1 || !ownerIds[0]) throw new Error("Produtos de lojas diferentes não podem ser combinados");

    const normalizedShipping = {
      postal_code: postalCode,
      address,
      number,
      complement,
      neighborhood,
      city,
      state,
      recipient_code: recipientCode,
      shipping_option: normalizedShippingOption,
    };

    const trackingTokenHash = await sha256(idempotencyKey);

    const { data, error } = await db.rpc("create_store_order_service", {
      p_owner_id: ownerIds[0],
      p_customer: { name: customerName, email, phone, recipient_code: recipientCode },
      p_shipping: normalizedShipping,
      p_items: normalizedItems,
      p_shipping_amount: shippingAmount,
      p_payment_method: "PENDING",
      p_coupon_code: couponCode || null,
      p_idempotency_key: idempotencyKey,
      p_tracking_token_hash: trackingTokenHash,
      p_customer_user_id: customerUserId,
    });
    if (error) throw error;

    const order = Array.isArray(data) ? data[0] : data;
    if (!order?.id) throw new Error("Pedido não criado");

    // Não devolva CPF, endereço, telefone ou outros campos do registro inteiro
    // ao navegador. O checkout precisa somente destes campos para acompanhar e
    // iniciar o pagamento do pedido recém-criado.
    const publicOrder = {
      id: order.id,
      order_number: order.order_number,
      total_amount: Number(order.total_amount || 0),
      payment_status: order.payment_status,
      status: order.status,
      tracking_token: idempotencyKey,
    };

    return new Response(JSON.stringify(publicOrder), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao criar pedido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
