import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const box = { minLon: -48.6, maxLon: -48, minLat: -10.6, maxLat: -9.7 };

type Address = {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};
type GeoPoint = { lon: number; lat: number; source: string };

async function get(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function cep(value: string): Promise<Address> {
  const postalCode = dig(value);
  if (!/^\d{8}$/.test(postalCode)) throw new Error("CEP inválido.");
  const data = await get(`https://viacep.com.br/ws/${postalCode}/json/`, {
    headers: { Accept: "application/json" },
  });
  if (!data || data.erro) throw new Error("Não foi possível consultar o CEP informado.");
  return {
    street: String(data.logradouro || ""),
    number: "",
    neighborhood: String(data.bairro || ""),
    city: String(data.localidade || ""),
    state: String(data.uf || "").toUpperCase(),
    postalCode,
  };
}

// Referências manuais mantidas apenas para CEPs previamente conferidos.
async function geo(address: Address): Promise<GeoPoint> {
  const references: Record<string, [number, number]> = {
    "77001540": [-48.346, -10.163],
    "77001570": [-48.3492, -10.1618],
    "77015007": [-48.33366, -10.18457],
  };
  const reference = references[address.postalCode];
  if (reference) {
    return { lon: reference[0], lat: reference[1], source: "referência de CEP validada" };
  }

  const streetWords = norm(address.street).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !/^\d+$/.test(word));
  if (!streetWords.length) {
    throw new Error("Não foi possível identificar o logradouro deste endereço. Confira o CEP e o nome da rua.");
  }

  const queries = [
    [address.street, address.number, address.neighborhood, address.city, address.state, address.postalCode, "Brasil"],
    [address.street, address.neighborhood, address.city, address.state, address.postalCode, "Brasil"],
    [address.street, address.neighborhood, address.city, address.state, "Brasil"],
  ].map((parts) => parts.filter(Boolean).join(", "));

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "br",
      limit: "10",
      viewbox: "-48.60,-9.70,-48.00,-10.60",
      bounded: "1",
    });
    const data = await get(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "ViolettaStoreShipping/1.1" },
    });
    const results = Array.isArray(data) ? data : [];
    const match = results.find((item: any) => {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      const resultAddress = item?.address || {};
      const resultCity = norm(
        resultAddress.city || resultAddress.town || resultAddress.municipality ||
        resultAddress.city_district || resultAddress.village || "",
      );
      const resultState = norm(resultAddress.state || "");
      const resultPostalCode = dig(resultAddress.postcode);
      const resultLabel = norm(item?.display_name || "");
      const resultRoad = norm(
        resultAddress.road || resultAddress.pedestrian || resultAddress.footway || resultAddress.residential || "",
      );
      const hasStreetMatch = streetWords.some((word) => resultRoad.includes(word) || resultLabel.includes(word));
      const cityMatches = resultCity === norm(address.city) || resultCity.includes(norm(address.city));
      const stateMatches = !resultState || resultState.includes("tocantins") || resultState === "to";
      const postalMatches = !resultPostalCode || resultPostalCode === address.postalCode;
      return Number.isFinite(lat) && Number.isFinite(lon) &&
        lon >= box.minLon && lon <= box.maxLon && lat >= box.minLat && lat <= box.maxLat &&
        cityMatches && stateMatches && postalMatches && hasStreetMatch;
    });
    if (match) {
      return { lon: Number(match.lon), lat: Number(match.lat), source: "OpenStreetMap/Nominatim" };
    }
  }

  // Nunca substituir um endereço não localizado por coordenadas genéricas.
  throw new Error("Não conseguimos localizar este endereço com segurança. Confira rua, bairro e CEP ou fale com a Violetta para confirmar o frete.");
}

function straightLineKm(origin: GeoPoint, destination: GeoPoint) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(origin.lat);
  const lat2 = radians(destination.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(destination.lon - origin.lon);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

async function routeWithOsrm(origin: GeoPoint, destination: GeoPoint) {
  const coordinates = encodeURIComponent(`${origin.lon},${origin.lat};${destination.lon},${destination.lat}`);
  const data = await get(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=false`, { headers: { Accept: "application/json" } });
  const meters = Number(data?.routes?.[0]?.distance);
  if (data?.code !== "Ok" || !Number.isFinite(meters) || meters <= 0) throw new Error("Não foi possível calcular a rota pelas ruas. Tente novamente.");
  return { routeKm: meters / 1000, seconds: Number(data?.routes?.[0]?.duration), provider: "OSRM" };
}

async function route(origin: GeoPoint, destination: GeoPoint) {
  const directKm = straightLineKm(origin, destination);
  if (!Number.isFinite(directKm) || directKm < 0.01) {
    throw new Error("A localização do endereço não parece válida. Confira o endereço informado.");
  }
  const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
  let routeKm: number;
  let seconds: number;
  let provider: string;
  if (mapsKey) {
    const data = await get("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": mapsKey, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
        travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", units: "METRIC",
      }),
    });
    const meters = Number(data?.routes?.[0]?.distanceMeters);
    const duration = Number(String(data?.routes?.[0]?.duration || "").replace(/s$/, ""));
    if (Number.isFinite(meters) && meters > 0) {
      routeKm = meters / 1000; seconds = duration; provider = "Google Routes API";
    } else {
      const fallback = await routeWithOsrm(origin, destination);
      routeKm = fallback.routeKm; seconds = fallback.seconds; provider = fallback.provider;
    }
  } else {
    const fallback = await routeWithOsrm(origin, destination);
    routeKm = fallback.routeKm; seconds = fallback.seconds; provider = fallback.provider;
  }
  // A rota não pode ser significativamente menor que a linha reta.
  // A tolerância considera o ajuste (snap) dos pontos para as vias do roteador.
  const toleranceKm = Math.max(0.25, directKm * 0.03);
  if (routeKm + toleranceKm < directKm) {
    throw new Error("O cálculo da rota retornou uma distância inconsistente. Não calculamos o frete para evitar cobrar um valor incorreto. Tente novamente ou fale com a Violetta.");
  }
  // Sinaliza rotas suspeitamente próximas à linha reta para não subestimar trajetos.
  const routeRatio = routeKm / directKm;
  if (!Number.isFinite(routeRatio) || routeRatio < 0.97) {
    throw new Error("Não foi possível validar a distância deste endereço. Confira os dados ou fale com a Violetta.");
  }
  return {
    km: Number(routeKm.toFixed(2)),
    straight_line_km: Number(directKm.toFixed(2)),
    min: Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null,
    route_ratio: Number(routeRatio.toFixed(2)),
    provider,
    origin_geocoder: origin.source,
    destination_geocoder: destination.source,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const body = await request.json();
    const shipping = body?.shipping || {};
    const city = norm(shipping.city).replace(/[\s,/-]*(to|tocantins)$/, "");
    const state = norm(shipping.state) === "tocantins" ? "TO" : String(shipping.state || "").trim().toUpperCase();
    const postalCode = dig(shipping.postal_code);

    if (city !== "palmas" || state !== "TO") {
      throw new Error("A entrega automática está disponível somente para endereços de Palmas-TO.");
    }
    if (!/^\d{8}$/.test(postalCode) || !shipping.address || !shipping.number || !shipping.neighborhood) {
      throw new Error("Preencha CEP, logradouro, número e bairro para calcular a rota.");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Configuração do servidor indisponível.");

    const db = createClient(url, key);
    const { data: settings, error } = await db.from("storefront_settings")
      .select("shipping_palmas_enabled,shipping_palmas_free_above,shipping_palmas_distance_rules,shipping_origin_postal_code,shipping_origin_address_confirmed,shipping_origin_draft_postal_code,shipping_origin_draft_street,shipping_origin_draft_number,shipping_origin_draft_neighborhood,shipping_origin_draft_city,shipping_origin_draft_state")
      .eq("store_slug", "violetta")
      .maybeSingle();

    if (error || !settings) throw new Error("Não foi possível carregar as regras de frete da loja.");
    if (settings.shipping_palmas_enabled !== true) throw new Error("O cálculo automático de frete para Palmas está desativado.");

    const origin: Address = settings.shipping_origin_address_confirmed === true
      ? {
          street: String(settings.shipping_origin_draft_street || ""),
          number: String(settings.shipping_origin_draft_number || ""),
          neighborhood: String(settings.shipping_origin_draft_neighborhood || ""),
          city: String(settings.shipping_origin_draft_city || "Palmas"),
          state: String(settings.shipping_origin_draft_state || "TO").toUpperCase(),
          postalCode: dig(settings.shipping_origin_draft_postal_code),
        }
      : await cep(String(settings.shipping_origin_postal_code || ""));

    const destination: Address = {
      street: String(shipping.address),
      number: String(shipping.number),
      neighborhood: String(shipping.neighborhood),
      city: String(shipping.city),
      state,
      postalCode,
    };

    const originPoint = await geo(origin);
    const destinationPoint = await geo(destination);
    const distance = await route(originPoint, destinationPoint);
    const rules = Array.isArray(settings.shipping_palmas_distance_rules)
      ? settings.shipping_palmas_distance_rules
      : [
          { min_km: 0, max_km: 2, price: 7 },
          { min_km: 2.1, max_km: 3, price: 8 },
          { min_km: 3.1, max_km: 5, price: 9 },
          { min_km: 5.1, max_km: 6, price: 10 },
          { min_km: 6.1, max_km: 6.9, price: 11 },
          { min_km: 7, max_km: 7.9, price: 12 },
          { min_km: 8, max_km: 8.9, price: 13 },
          { min_km: 9, max_km: 9.9, price: 14 },
          { min_km: 10, max_km: 10.9, price: 15 },
          { min_km: 11, max_km: 11.9, price: 16 },
          { min_km: 12, max_km: 12.9, price: 18 },
          { min_km: 13, max_km: 13.9, price: 20 },
          { min_km: 14, max_km: 14.9, price: 22 },
          { min_km: 15, max_km: 15.9, price: 24 },
          { min_km: 16, max_km: 16.9, price: 26 },
          { min_km: 17, max_km: 17.9, price: 28 },
        ];
    const rule = rules.find((item: any) => {
      const min = Number(item?.min_km);
      const max = item?.max_km == null || item?.max_km === "" ? Infinity : Number(item.max_km);
      return Number.isFinite(min) && Number.isFinite(Number(item?.price)) && distance.km >= min && distance.km <= max;
    });
    const serviceable = Boolean(rule);
    const subtotal = Math.max(0, Number(body?.subtotal) || 0);
    const freeAbove = Number(settings.shipping_palmas_free_above) || 0;
    const price = !serviceable ? null : freeAbove > 0 && subtotal >= freeAbove ? 0 : Number(rule?.price ?? 0);

    return json({
      distance_km: distance.km,
      straight_line_km: distance.straight_line_km,
      route_ratio: distance.route_ratio,
      serviceable,
      shipping_price: price,
      shipping_price_formatted: price === null
        ? null
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price),
      service: !serviceable
        ? "Frete a combinar"
        : price === 0
          ? "Entrega em Palmas · frete grátis"
          : `Entrega em Palmas · ${distance.km.toFixed(1)} km`,
      estimated_duration_minutes: distance.min,
      provider: distance.provider,
      geocoder: `${distance.origin_geocoder} → ${distance.destination_geocoder}`,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível calcular o frete." }, 400);
  }
});
