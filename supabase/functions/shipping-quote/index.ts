import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

async function geocodePostalCode(postalCode: string) {
  const cep = postalCode.replace(/\D/g, "");
  const response = await fetch(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&postalcode=" +
      encodeURIComponent(cep) +
      "&country=Brazil&limit=1",
    { headers: { Accept: "application/json", "User-Agent": "Violetta-Store/1.0" } },
  );
  if (!response.ok) throw new Error("Não foi possível localizar o CEP");
  const data = await response.json();
  if (!Array.isArray(data) || !data[0]) throw new Error("CEP não localizado");
  return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
}

async function routeDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const coordinates = encodeURIComponent(`${a.lon},${a.lat};${b.lon},${b.lat}`);
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=false`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error("Não foi possível calcular a rota pelas ruas");
  const data = await response.json();
  const meters = Number(data?.routes?.[0]?.distance);
  if (data?.code !== "Ok" || !Number.isFinite(meters) || meters <= 0) {
    throw new Error("Não foi possível obter a distância da rota pelas ruas");
  }
  return meters / 1000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const postalCode = String(body.postal_code || "").replace(/\D/g, "");
    const items = Array.isArray(body.items) ? body.items : [];
    if (!/^\d{8}$/.test(postalCode)) throw new Error("CEP inválido");
    if (!items.length || items.length > 30) throw new Error("Carrinho inválido");

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Serviço de loja não configurado" }, 503);

    const db = createClient(url, key);
    const ids = items.map((item: any) => Number(item.product_id));
    const quantities = new Map<number, number>();
    for (const item of items) {
      const id = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new Error("Carrinho inválido");
      }
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    const { data: products, error: productError } = await db
      .from("products")
      .select("id,price,active,owner_id")
      .in("id", [...quantities.keys()]);
    if (productError) throw productError;
    if (!products || products.length !== quantities.size || products.some((p: any) => p.active === false)) {
      throw new Error("Produto indisponível");
    }

    const owners = [...new Set(products.map((p: any) => String(p.owner_id)))];
    if (owners.length !== 1 || !owners[0]) throw new Error("Carrinho inválido");
    const ownerId = owners[0];

    const { data: settings, error: settingsError } = await db
      .from("storefront_settings")
      .select("shipping_palmas_enabled,shipping_palmas_free_above,shipping_palmas_pickup_enabled,shipping_origin_postal_code,shipping_palmas_distance_rules")
      .eq("owner_id", ownerId)
      .eq("store_slug", "violetta")
      .maybeSingle();
    if (settingsError) throw settingsError;

    const city = String(body.city || "").trim();
    const state = String(body.state || "").trim().toUpperCase();
    const normalizedCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const isPalmas = normalizedCity === "PALMAS" && state === "TO";
    let options: any[] = [];

    if (isPalmas && settings?.shipping_palmas_enabled) {
      const originCep = String(settings.shipping_origin_postal_code || "").replace(/\D/g, "");
      if (!/^\d{8}$/.test(originCep)) throw new Error("CEP de origem da loja não configurado");
      const origin = await geocodePostalCode(originCep);
      const destination = await geocodePostalCode(postalCode);
      const distance = Number((await routeDistanceKm(origin, destination)).toFixed(1));
      const rules = Array.isArray(settings.shipping_palmas_distance_rules) ? settings.shipping_palmas_distance_rules : [];
      const rule = rules.find((item: any, index: number) => {
        const min = Number(item?.min_km);
        const max = item?.max_km === null || item?.max_km === undefined || item?.max_km === "" ? null : Number(item.max_km);
        const last = index === rules.length - 1;
        return Number.isFinite(min) && distance >= min && max !== null && Number.isFinite(max) && (last ? distance <= max : distance < max);
      });
      if (rule) {
        options.push({
          id: "palmas-distance-" + Number(rule.min_km) + "-" + (rule.max_km ?? "plus"),
          company: "Violetta",
          service: "Entrega em Palmas · " + distance.toFixed(1) + " km",
          price: Math.max(0, Number(rule.price) || 0),
          delivery_time: 0,
        });
      }
    }

    if (isPalmas && settings?.shipping_palmas_pickup_enabled) {
      options.push({
        id: "violetta-pickup",
        company: "Violetta",
        service: "Retirada no local",
        price: 0,
        delivery_time: 0,
      });
    }

    if (!isPalmas || !settings?.shipping_palmas_enabled || !options.length) {
      options.push({
        id: "frete-a-combinar",
        company: "Violetta",
        service: "Frete a combinar",
        price: 0,
        delivery_time: 0,
      });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: quote, error: quoteError } = await db
      .from("shipping_quotes")
      .insert({
        postal_code: postalCode,
        owner_id: ownerId,
        items,
        destination: { postal_code: postalCode, city, state },
        options,
        expires_at: expiresAt,
      })
      .select("id,expires_at")
      .single();
    if (quoteError) throw quoteError;

    return json({ quote_id: quote.id, expires_at: quote.expires_at, options });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível calcular o frete" }, 400);
  }
});
