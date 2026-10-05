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

async function geocodePostalCode(postalCode: string) {
  const cep = postalCode.replace(/\D/g, "");
  if (cep.length !== 8) throw new Error("CEP inválido");
  const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&postalcode=" + cep + "&country=Brazil&limit=1", {
    headers: { "Accept": "application/json", "User-Agent": "Violetta-Store/1.0" },
  });
  if (!response.ok) throw new Error("Não foi possível calcular a distância");
  const data = await response.json();
  if (!Array.isArray(data) || !data[0]) throw new Error("Não foi possível localizar o CEP para calcular a distância");
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
    const normalizedCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const isPalmas = normalizedCity === "PALMAS" && state === "TO";
    let shippingAmount = 0;
    let normalizedShippingOption: any;

    if (isPalmas) {
      const { data: storeSettings, error: settingsError } = await db
        .from("storefront_settings")
        .select("shipping_palmas_enabled,shipping_origin_postal_code,shipping_palmas_distance_rules")
        .eq("store_slug", "violetta")
        .maybeSingle();
      if (settingsError) throw settingsError;

      if (storeSettings?.shipping_palmas_enabled) {
        if (requestedService === "Frete a combinar") throw new Error("O frete de Palmas está configurado para cálculo automático.");
        const rules = Array.isArray(storeSettings.shipping_palmas_distance_rules) ? storeSettings.shipping_palmas_distance_rules : [];
        const originCep = String(storeSettings.shipping_origin_postal_code || "").replace(/\D/g, "");
        if (!/^\d{8}$/.test(originCep)) throw new Error("O CEP de origem da loja não está configurado corretamente");
        const origin = await geocodePostalCode(originCep);
        const destination = await geocodePostalCode(postalCode);
        const distance = Number(distanceKm(origin, destination).toFixed(1));
        const rule = rules.find((item: any) => {
          const min = Number(item?.min_km);
          const max = item?.max_km === null || item?.max_km === undefined || item?.max_km === "" ? null : Number(item.max_km);
          return Number.isFinite(min) && distance >= min && (max === null ? true : Number.isFinite(max) && distance < max);
        });
        if (!rule) throw new Error("Não há uma faixa de frete configurada para esta distância");
        shippingAmount = Math.max(0, Number(rule.price) || 0);
        normalizedShippingOption = { id: "palmas-distance-" + Number(rule.min_km) + "-" + (rule.max_km ?? "plus"), company: "Violetta", service: "Entrega em Palmas · " + distance.toFixed(1) + " km", price: shippingAmount, delivery_time: 0 };
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
    });
    if (error) throw error;

    const order = Array.isArray(data) ? data[0] : data;
    if (!order?.id) throw new Error("Pedido não criado");


    return new Response(JSON.stringify({ ...order, tracking_token: idempotencyKey }), {
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