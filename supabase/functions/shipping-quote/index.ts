import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function straightLineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat), lat2 = radians(b.lat);
  const deltaLat = lat2 - lat1, deltaLon = radians(b.lon - a.lon);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

async function geocodePostalCode(postalCode: string, city: string, state: string) {
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
  if (!key) throw new Error("Google Maps não está configurado no servidor. O frete não foi calculado.");
  const cep = postalCode.replace(/\D/g, "");
  const params = new URLSearchParams({
    address: `${cep}, ${city}, ${state}, Brasil`,
    components: `country:BR|postal_code:${cep}`,
    key,
    language: "pt-BR",
    region: "br",
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!response.ok) throw new Error("O Google Maps não conseguiu localizar o CEP.");
  const data = await response.json();
  if (data?.status !== "OK" || !Array.isArray(data.results) || !data.results[0]) {
    throw new Error("O Google Maps não localizou este CEP. Confira o endereço antes de calcular o frete.");
  }
  const candidates = data.results.map((item: any) => {
    const components = Array.isArray(item.address_components) ? item.address_components : [];
    const get = (type: string, short = false) => {
      const c = components.find((part: any) => part.types?.includes(type));
      return c ? (short ? c.short_name : c.long_name) : "";
    };
    return {
      lat: Number(item.geometry?.location?.lat),
      lon: Number(item.geometry?.location?.lng),
      city: String(get("locality") || get("postal_town") || get("administrative_area_level_2")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
      state: String(get("administrative_area_level_1", true) || get("administrative_area_level_1")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
      country: String(get("country", true) || get("country")).toLowerCase(),
      postalCode: String(get("postal_code")).replace(/\D/g, ""),
    };
  });
  const normalizedCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = candidates.find((c: any) =>
    Number.isFinite(c.lat) && Number.isFinite(c.lon) &&
    c.city.includes(normalizedCity) &&
    (c.state === "to" || c.state.includes("tocantins")) &&
    (c.country === "br" || c.country.includes("brasil")) &&
    (!c.postalCode || c.postalCode === cep) &&
    c.lon >= -48.6 && c.lon <= -48 && c.lat >= -10.6 && c.lat <= -9.7
  );
  if (!match) throw new Error("O Google Maps retornou uma localização que não corresponde com segurança a Palmas-TO e ao CEP informado.");
  return { lat: match.lat, lon: match.lon };
}

async function routeDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
  if (!key) throw new Error("Google Maps não está configurado no servidor. O frete não foi calculado.");
  const directKm = straightLineKm(a, b);
  if (!Number.isFinite(directKm) || directKm < 0.01) throw new Error("A localização retornada não parece válida.");
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lon } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lon } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC",
    }),
  });
  if (!response.ok) throw new Error("O Google Maps não conseguiu calcular a rota. O frete não foi definido.");
  const data = await response.json();
  const meters = Number(data?.routes?.[0]?.distanceMeters);
  if (data?.routes?.[0]?.distanceMeters == null || !Number.isFinite(meters) || meters <= 0) {
    throw new Error("O Google Maps retornou uma rota inválida. O frete não foi calculado.");
  }
  const distanceKm = meters / 1000;
  const toleranceKm = Math.max(0.2, directKm * 0.03);
  const ratio = distanceKm / directKm;
  if (distanceKm + toleranceKm < directKm || !Number.isFinite(ratio) || ratio < 0.97 || ratio > 4.5) {
    throw new Error("A distância da rota não passou pela validação. O frete não foi calculado para evitar cobrança incorreta.");
  }
  return Number(distanceKm.toFixed(2));
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
      const origin = await geocodePostalCode(originCep, "Palmas", "TO");
      const destination = await geocodePostalCode(postalCode, city, state);
      const distance = Number((await routeDistanceKm(origin, destination)).toFixed(1));
      const rules = Array.isArray(settings.shipping_palmas_distance_rules) ? settings.shipping_palmas_distance_rules : [];
      const rule = rules.find((item: any, index: number) => {
        const min = Number(item?.min_km);
        const max = item?.max_km === null || item?.max_km === undefined || item?.max_km === "" ? null : Number(item.max_km);
        return Number.isFinite(min) && distance >= min && max !== null && Number.isFinite(max) && distance <= max;
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
