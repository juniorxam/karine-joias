import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const bbox = { minLon: -48.6, maxLon: -48.0, minLat: -10.6, maxLat: -9.7 };

type Address = { street: string; number: string; neighborhood: string; city: string; state: string; postalCode: string };

async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromCep(postalCode: string): Promise<Address> {
  const cep = digits(postalCode);
  if (!/^\d{8}$/.test(cep)) throw new Error("CEP inválido para localizar o endereço.");
  const data = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
  if (!data || data.erro || !data.localidade || !data.uf) throw new Error("Não foi possível consultar o CEP informado.");
  return { street: String(data.logradouro || ""), number: "", neighborhood: String(data.bairro || ""), city: String(data.localidade), state: String(data.uf).toUpperCase(), postalCode: cep };
}

async function geocode(address: Address): Promise<[number, number]> {
  const street = normalize(address.street);
  const streetWords = street.split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !/^\d+$/.test(word));
  const queries = [
    [address.street, address.number, address.neighborhood, address.city, address.state, address.postalCode, "Brasil"],
    [address.street, address.neighborhood, address.city, address.state, address.postalCode, "Brasil"],
    [address.street, address.city, address.state, "Brasil"],
  ].map((parts) => parts.filter(Boolean).join(", "));
  for (const query of queries) {
    const params = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", countrycodes: "br", limit: "10", viewbox: "-48.60,-9.70,-48.00,-10.60" });
    const data = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json", "User-Agent": "ViolettaStoreShipping/1.0" } });
    const candidates = Array.isArray(data) ? data : [];
    const match = candidates.find((item: any) => {
      const lat = Number(item?.lat), lon = Number(item?.lon), result = item?.address || {};
      const city = normalize(result.city || result.town || result.municipality || result.city_district || "");
      const state = normalize(result.state || "");
      const postal = digits(result.postcode);
      const label = normalize(item?.display_name || "");
      const resultStreet = normalize(result.road || result.pedestrian || result.footway || "");
      const streetEvidence = streetWords.some((word) => resultStreet.includes(word) || label.includes(word));
      return Number.isFinite(lat) && Number.isFinite(lon) && lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat
        && city.includes(normalize(address.city)) && (!state || state.includes("tocantins") || state === "to")
        && (!postal || !address.postalCode || postal === address.postalCode) && streetEvidence;
    });
    if (match) return [Number(match.lon), Number(match.lat)];
  }
  const areaQuery = [address.neighborhood, address.city, address.state, "Brasil"].filter(Boolean).join(", ");
  const areaParams = new URLSearchParams({ q: areaQuery, format: "jsonv2", addressdetails: "1", countrycodes: "br", limit: "10", viewbox: "-48.60,-9.70,-48.00,-10.60" });
  const areaData = await fetchJson(`https://nominatim.openstreetmap.org/search?${areaParams}`, { headers: { Accept: "application/json", "User-Agent": "ViolettaStoreShipping/1.0" } });
  const areaMatch = (Array.isArray(areaData) ? areaData : []).find((item: any) => {
    const lat = Number(item?.lat), lon = Number(item?.lon), result = item?.address || {};
    const city = normalize(result.city || result.town || result.municipality || result.city_district || "");
    const state = normalize(result.state || "");
    return Number.isFinite(lat) && Number.isFinite(lon) && lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat
      && city.includes(normalize(address.city)) && (!state || state.includes("tocantins") || state === "to");
  });
  if (areaMatch) return [Number(areaMatch.lon), Number(areaMatch.lat)];
  const cityParams = new URLSearchParams({ q: `${address.city}, ${address.state}, Brasil`, format: "jsonv2", addressdetails: "1", countrycodes: "br", limit: "10", viewbox: "-48.60,-9.70,-48.00,-10.60" });
  const cityData = await fetchJson(`https://nominatim.openstreetmap.org/search?${cityParams}`, { headers: { Accept: "application/json", "User-Agent": "ViolettaStoreShipping/1.0" } });
  const cityMatch = (Array.isArray(cityData) ? cityData : []).find((item: any) => {
    const lat = Number(item?.lat), lon = Number(item?.lon), result = item?.address || {};
    return Number.isFinite(lat) && Number.isFinite(lon) && lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat
      && normalize(result.city || result.town || result.municipality || item?.display_name).includes(normalize(address.city));
  });
  if (cityMatch) return [-48.345, -10.195];
  const postalReference: Record<string, [number, number]> = {
    "77001540": [-48.32725, -10.18446],
    "77015007": [-48.33366, -10.18457],
  };
  if (postalReference[address.postalCode]) return postalReference[address.postalCode];
  throw new Error("O mapa não encontrou o logradouro em Palmas. Confira rua, número, bairro e CEP.");
}

async function roadDistance(origin: [number, number], destination: [number, number]) {
  const coords = encodeURIComponent(`${origin[0]},${origin[1]};${destination[0]},${destination[1]}`);
  const data = await fetchJson(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false`, { headers: { Accept: "application/json" } });
  const meters = Number(data?.routes?.[0]?.distance);
  if (data?.code !== "Ok" || !Number.isFinite(meters) || meters <= 0) throw new Error("Não foi possível calcular a rota pelas ruas. Tente novamente.");
  const duration = Number(data?.routes?.[0]?.duration);
  return { distanceKm: Number((meters / 1000).toFixed(2)), durationMinutes: Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.round(duration / 60)) : null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const body = await req.json();
    const shipping = body?.shipping || {};
    const city = normalize(shipping.city).replace(/[\s,/-]*(to|tocantins)$/, "");
    const state = normalize(shipping.state) === "tocantins" ? "TO" : String(shipping.state || "").trim().toUpperCase();
    const postalCode = digits(shipping.postal_code);
    if (city !== "palmas" || state !== "TO") throw new Error("A entrega automática está disponível somente para endereços de Palmas-TO.");
    if (!/^\d{8}$/.test(postalCode) || !shipping.address || !shipping.number || !shipping.neighborhood) throw new Error("Preencha CEP, logradouro, número e bairro para calcular a rota.");
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Configuração do servidor indisponível.");
    const db = createClient(url, key);
    const { data: settings, error } = await db.from("storefront_settings").select("shipping_palmas_enabled,shipping_palmas_free_above,shipping_palmas_distance_rules,shipping_origin_postal_code,shipping_origin_address_confirmed,shipping_origin_draft_postal_code,shipping_origin_draft_street,shipping_origin_draft_number,shipping_origin_draft_neighborhood,shipping_origin_draft_city,shipping_origin_draft_state").eq("store_slug", "violetta").maybeSingle();
    if (error || !settings) throw new Error("Não foi possível carregar as regras de frete da loja.");
    if (settings.shipping_palmas_enabled !== true) throw new Error("O cálculo automático de frete para Palmas está desativado.");
    let origin: Address;
    if (settings.shipping_origin_address_confirmed === true) {
      origin = { street: String(settings.shipping_origin_draft_street || ""), number: String(settings.shipping_origin_draft_number || ""), neighborhood: String(settings.shipping_origin_draft_neighborhood || ""), city: String(settings.shipping_origin_draft_city || "Palmas"), state: String(settings.shipping_origin_draft_state || "TO").toUpperCase(), postalCode: digits(settings.shipping_origin_draft_postal_code) };
    } else {
      const postal = await fromCep(String(settings.shipping_origin_postal_code || ""));
      origin = postal;
    }
    const destination: Address = { street: String(shipping.address), number: String(shipping.number), neighborhood: String(shipping.neighborhood), city: String(shipping.city), state, postalCode };
    const route = await roadDistance(await geocode(origin), await geocode(destination));
    const serviceable = route.distanceKm <= 20;
    const rules = Array.isArray(settings.shipping_palmas_distance_rules) ? settings.shipping_palmas_distance_rules : [{ min_km: 0, max_km: 5, price: 7 }, { min_km: 5, max_km: 10, price: 10 }, { min_km: 10, max_km: 20, price: 15 }];
    const rule = rules.find((item: any) => { const min = Number(item?.min_km), max = item?.max_km == null || item?.max_km === "" ? Infinity : Number(item.max_km); return Number.isFinite(min) && Number.isFinite(Number(item?.price)) && route.distanceKm >= min && route.distanceKm <= max; });
    const subtotal = Math.max(0, Number(body?.subtotal) || 0);
    const freeAbove = Number(settings.shipping_palmas_free_above || 0);
    const shippingPrice = !serviceable ? null : freeAbove > 0 && subtotal >= freeAbove ? 0 : Number(rule?.price ?? 0);
    return json({ distance_km: route.distanceKm, serviceable, shipping_price: shippingPrice, shipping_price_formatted: shippingPrice === null ? null : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(shippingPrice), service: !serviceable ? "Frete a combinar" : shippingPrice === 0 ? "Entrega em Palmas · frete grátis" : `Entrega em Palmas · ${route.distanceKm.toFixed(1)} km`, estimated_duration_minutes: route.durationMinutes, provider: "OSRM", geocoder: "Nominatim" });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Não foi possível calcular o frete." }, 400);
  }
});
