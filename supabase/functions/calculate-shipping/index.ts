import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...cors, "Content-Type": "application/json" };
const GEOCODE_TIMEOUT_MS = 8_000;
const ROUTE_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const geocodeCache = new Map<string, { coordinates: [number, number]; expiresAt: number }>();

function timedLog(stage: string, startedAt: number, extra: Record<string, unknown> = {}) {
  console.info(JSON.stringify({ event: "shipping_api_timing", stage, duration_ms: Date.now() - startedAt, ...extra }));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, stage: string) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    timedLog(stage, startedAt, { status: response.status });
    return response;
  } catch (error) {
    timedLog(stage, startedAt, { outcome: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error" });
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(stage === "geocode" ? "A localização do endereço demorou demais. Confira o endereço e tente novamente." : "O serviço de rotas demorou demais para responder. Tente novamente em instantes.");
    }
    throw new Error("Não foi possível conectar ao serviço de cálculo de distância. Tente novamente.");
  } finally {
    clearTimeout(timer);
  }
}

type AddressParts = {
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};

async function resolvePostalCode(postalCode: string) {
  const cep = postalCode.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) throw new Error("CEP inválido para localizar o endereço.");
  const response = await fetchWithTimeout(
    "https://viacep.com.br/ws/" + cep + "/json/",
    { headers: { "Accept": "application/json" } },
    GEOCODE_TIMEOUT_MS,
    "postal_lookup"
  );
  if (!response.ok) throw new Error("Não foi possível consultar o CEP informado.");
  const data = await response.json();
  if (data?.erro || !data?.localidade || !data?.uf || !data?.logradouro) {
    throw new Error("O CEP não retornou um logradouro válido. Confira o CEP e o endereço.");
  }
  return {
    address: String(data.logradouro).trim(),
    neighborhood: String(data.bairro || "").trim(),
    city: String(data.localidade).trim(),
    state: String(data.uf).trim().toUpperCase(),
    postalCode: cep,
  } satisfies AddressParts;
}

async function geocodeAddress(parts: AddressParts, apiKey: string): Promise<[number, number]> {
  const cacheKey = [parts.address, parts.neighborhood, parts.city, parts.state, parts.postalCode]
    .join("|").toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.coordinates;

  // Try a full query first, then progressively simpler street-focused queries.
  // ORS can rank a similarly named street (e.g. Alameda 43) above the requested
  // one (e.g. Alameda 4), so a city/street layer alone is not sufficient.
  const queries = [
    [parts.address, parts.neighborhood, parts.city, parts.state, parts.postalCode, "Brasil"].filter(Boolean).join(", "),
    [parts.address, parts.city, parts.state, "Brasil"].filter(Boolean).join(", "),
    [parts.address, parts.neighborhood, parts.city, parts.state].filter(Boolean).join(", "),
  ];
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const requestedAddress = normalize(parts.address);
  const alamedaMatch = requestedAddress.match(/\balameda\s+(\d+)\b/);
  const requestedAlamedaNumber = alamedaMatch?.[1] || null;
  let allFeatures: any[] = [];
  let feature: any = null;
  for (const [queryIndex, textQuery] of queries.entries()) {
    const params = new URLSearchParams({
      text: textQuery,
      "boundary.country": "BR",
      "boundary.rect.min_lon": "-48.60",
      "boundary.rect.min_lat": "-10.60",
      "boundary.rect.max_lon": "-48.00",
      "boundary.rect.max_lat": "-9.70",
      size: "10",
    });
    const response = await fetchWithTimeout(
      "https://api.openrouteservice.org/geocode/search?" + params.toString(),
      { headers: { "Authorization": apiKey, "Accept": "application/json" } },
      GEOCODE_TIMEOUT_MS,
      "geocode"
    );
    if (response.status === 429) throw new Error("O serviço de localização atingiu o limite de consultas. Aguarde um pouco e tente novamente.");
    if (response.status === 401 || response.status === 403) throw new Error("A configuração da API de localização precisa ser verificada.");
    if (!response.ok) {
      if (queryIndex === queries.length - 1) throw new Error("Não foi possível localizar o endereço pelo CEP e logradouro. Confira o endereço.");
      continue;
    }
    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    allFeatures = allFeatures.concat(features);
    const candidates = features.filter((item: any) => {
      const point = item?.geometry?.coordinates;
      if (!Array.isArray(point) || point.length < 2) return false;
      const lon = Number(point[0]);
      const lat = Number(point[1]);
      const props = item?.properties || {};
      const layer = String(props.layer || "").toLowerCase();
      const label = String(props.label || "");
      const normalizedLabel = normalize(label);
      const resultCity = normalize(String(props.locality || props.localadmin || props.city || ""));
      const resultRegion = String(props.region_a || props.region || "").toUpperCase();
      const resultPostal = String(props.postalcode || "").replace(/\D/g, "");
      const isGenericPlace = ["locality", "localadmin", "county", "region", "country"].includes(layer)
        || /^palmas,\s*to,\s*brazil$/i.test(label);
      // Prevent matching "Alameda 4" to "Alameda 43" and similar false positives.
      const resultAlameda = normalizedLabel.match(/\balameda\s+(\d+)\b/)?.[1] || null;
      if (requestedAlamedaNumber && resultAlameda !== requestedAlamedaNumber) return false;
      const addressWords = requestedAddress.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !/^\d+$/.test(word));
      const hasStreetNameEvidence = addressWords.some((word) => normalizedLabel.includes(word));
      return Number.isFinite(lon) && Number.isFinite(lat)
        && lon >= -48.60 && lon <= -48.00 && lat >= -10.60 && lat <= -9.70
        && !isGenericPlace
        && (!resultCity || resultCity.includes("palmas"))
        && (!resultRegion || resultRegion === "TO" || resultRegion.includes("TOCANTINS"))
        && (!resultPostal || resultPostal === parts.postalCode)
        && hasStreetNameEvidence;
    });
    feature = candidates[0] || null;
    if (feature) break;
  }
  // Fallback to Photon (OpenStreetMap-based) when ORS returns only a wrong street.
  // Keep the same strict street-number checks to avoid calculating a false route.
  if (!feature) {
    const photonQueries = [
      [parts.address, parts.neighborhood, parts.city, parts.state, parts.postalCode, "Brasil"].filter(Boolean).join(", "),
      [parts.address, parts.neighborhood, parts.city, parts.state, "Brasil"].filter(Boolean).join(", "),
    ];
    for (const textQuery of photonQueries) {
      const params = new URLSearchParams({ q: textQuery, limit: "10", lat: "-10.20", lon: "-48.35", lang: "en" });
      const response = await fetchWithTimeout(
        "https://photon.komoot.io/api/?" + params.toString(),
        { headers: { "Accept": "application/json" } },
        GEOCODE_TIMEOUT_MS,
        "photon_geocode"
      );
      if (!response.ok) continue;
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      allFeatures = allFeatures.concat(features);
      const candidates = features.filter((item: any) => {
        const point = item?.geometry?.coordinates;
        if (!Array.isArray(point) || point.length < 2) return false;
        const lon = Number(point[0]);
        const lat = Number(point[1]);
        const props = item?.properties || {};
        const label = String([props.name, props.street, props.district, props.city, props.state, props.country].filter(Boolean).join(", "));
        const normalizedLabel = normalize(label);
        const resultCity = normalize(String(props.city || props.district || ""));
        const resultState = normalize(String(props.state || ""));
        const resultPostal = String(props.postcode || "").replace(/\D/g, "");
        const resultAlameda = normalizedLabel.match(/\balameda\s+(\d+)\b/)?.[1] || null;
        const addressWords = requestedAddress.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !/^\d+$/.test(word));
        const hasStreetNameEvidence = addressWords.some((word) => normalizedLabel.includes(word));
        return Number.isFinite(lon) && Number.isFinite(lat)
          && lon >= -48.60 && lon <= -48.00 && lat >= -10.60 && lat <= -9.70
          && (!resultCity || resultCity.includes("palmas"))
          && (!resultState || resultState.includes("tocantins") || resultState === "to")
          && (!resultPostal || resultPostal === parts.postalCode)
          && (!requestedAlamedaNumber || resultAlameda === requestedAlamedaNumber)
          && hasStreetNameEvidence;
      });
      if (candidates.length) {
        const picked = candidates[0];
        feature = {
          geometry: picked.geometry,
          properties: {
            label: String([picked.properties?.name, picked.properties?.street, picked.properties?.district, picked.properties?.city, picked.properties?.state, picked.properties?.country].filter(Boolean).join(", ")),
            layer: "photon",
          },
        };
        break;
      }
    }
  }
  // Last-resort fallback: use an exact CEP/postal-code feature when providers do not index
  // the street in Palmas. This is an approximate neighborhood/CEP point, not an exact house pin.
  // Requiring an exact postcode prevents silently routing to a similarly named street.
  if (!feature) {
    const params = new URLSearchParams({
      text: [parts.postalCode, parts.city, parts.state, "Brasil"].filter(Boolean).join(", "),
      "boundary.country": "BR",
      "boundary.rect.min_lon": "-48.60",
      "boundary.rect.min_lat": "-10.60",
      "boundary.rect.max_lon": "-48.00",
      "boundary.rect.max_lat": "-9.70",
      size: "10",
      layers: "postalcode",
    });
    const response = await fetchWithTimeout(
      "https://api.openrouteservice.org/geocode/search?" + params.toString(),
      { headers: { "Authorization": apiKey, "Accept": "application/json" } },
      GEOCODE_TIMEOUT_MS,
      "geocode_postal_fallback"
    );
    if (response.ok) {
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      const exactPostal = features.find((item: any) => {
        const point = item?.geometry?.coordinates;
        const props = item?.properties || {};
        const resultPostal = String(props.postalcode || "").replace(/\D/g, "");
        const label = String(props.label || "");
        const normalizedLabel = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const city = normalize(String(props.locality || props.localadmin || props.city || label));
        const region = String(props.region_a || props.region || "").toUpperCase();
        return Array.isArray(point) && point.length >= 2
          && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
          && Number(point[0]) >= -48.60 && Number(point[0]) <= -48.00
          && Number(point[1]) >= -10.60 && Number(point[1]) <= -9.70
          && resultPostal === parts.postalCode
          && city.includes("palmas")
          && (!region || region === "TO" || region.includes("TOCANTINS"));
      });
      if (exactPostal) {
        feature = {
          geometry: exactPostal.geometry,
          properties: {
            ...exactPostal.properties,
            label: String(exactPostal.properties?.label || parts.postalCode + ", Palmas, TO"),
            layer: "postalcode_approximate",
          },
        };
        console.warn(JSON.stringify({
          event: "shipping_geocode_postal_fallback",
          postal_code: parts.postalCode,
          result_label: feature.properties.label,
          note: "CEP aproximado utilizado porque o logradouro não foi encontrado com confiança",
        }));
      }
    }
  }
  // Fallback 2: query OpenStreetMap Nominatim by exact CEP. ORS may return HTTP 200
  // with no postal-code features for CEPs in Palmas. Accept only an exact CEP match.
  if (!feature) {
    const params = new URLSearchParams({
      postalcode: parts.postalCode,
      city: parts.city,
      state: parts.state === "TO" ? "Tocantins" : parts.state,
      country: "Brazil",
      format: "jsonv2",
      addressdetails: "1",
      limit: "10",
    });
    const response = await fetchWithTimeout(
      "https://nominatim.openstreetmap.org/search?" + params.toString(),
      { headers: { "Accept": "application/json", "User-Agent": "ViolettaStoreShipping/1.0 (shipping address lookup)" } },
      GEOCODE_TIMEOUT_MS,
      "nominatim_postal_fallback"
    );
    if (response.ok) {
      const data = await response.json();
      const candidates = Array.isArray(data) ? data : [];
      const exactPostal = candidates.find((item: any) => {
        const lat = Number(item?.lat);
        const lon = Number(item?.lon);
        const address = item?.address || {};
        const resultPostal = String(address.postcode || "").replace(/\\D/g, "");
        const city = normalize(String(address.city || address.town || address.municipality || address.city_district || ""));
        const state = normalize(String(address.state || ""));
        return Number.isFinite(lat) && Number.isFinite(lon)
          && lon >= -48.60 && lon <= -48.00 && lat >= -10.60 && lat <= -9.70
          && resultPostal === parts.postalCode
          && city.includes("palmas")
          && (!state || state.includes("tocantins"));
      });
      if (exactPostal) {
        feature = {
          geometry: { coordinates: [Number(exactPostal.lon), Number(exactPostal.lat)] },
          properties: {
            label: String(exactPostal.display_name || parts.postalCode + ", Palmas, TO"),
            layer: "postalcode_approximate",
          },
        };
        console.warn(JSON.stringify({
          event: "shipping_geocode_postal_fallback",
          provider: "nominatim",
          postal_code: parts.postalCode,
          result_label: feature.properties.label,
          note: "Ponto aproximado do CEP; não representa o número exato do imóvel",
        }));
      }
    }
  }
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    console.warn(JSON.stringify({
      event: "shipping_geocode_no_address_match",
      postal_code: parts.postalCode,
      address: parts.address,
      candidate_labels: allFeatures.slice(0, 12).map((item: any) => ({
        label: String(item?.properties?.label || ""),
        layer: String(item?.properties?.layer || ""),
      })),
    }));
    throw new Error("O mapa não encontrou uma correspondência confiável para o logradouro e número informados. Confira o endereço ou CEP.");
  }
  const result: [number, number] = [Number(coordinates[0]), Number(coordinates[1])];
  console.info(JSON.stringify({
    event: "shipping_geocode_match",
    postal_code: parts.postalCode,
    result_label: String(feature?.properties?.label || ""),
    result_layer: String(feature?.properties?.layer || ""),
    coordinates: result,
  }));
  if (geocodeCache.size > 200) {
    for (const [key, value] of geocodeCache) if (value.expiresAt <= Date.now()) geocodeCache.delete(key);
    if (geocodeCache.size > 200) geocodeCache.clear();
  }
  geocodeCache.set(cacheKey, { coordinates: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function getStoreOriginAddress(): Promise<AddressParts> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Configuração do servidor indisponível.");
  const db = createClient(url, key);
  const { data, error } = await db.from("storefront_settings")
    .select("shipping_origin_postal_code,shipping_origin_address_confirmed,shipping_origin_draft_postal_code,shipping_origin_draft_street,shipping_origin_draft_number,shipping_origin_draft_neighborhood,shipping_origin_draft_city,shipping_origin_draft_state")
    .eq("store_slug", "violetta").maybeSingle();
  if (error) throw new Error("Não foi possível carregar a origem de entrega da loja.");
  if (data?.shipping_origin_address_confirmed === true) {
    const postalCode = String(data.shipping_origin_draft_postal_code || "").replace(/\D/g, "");
    const city = String(data.shipping_origin_draft_city || "").trim();
    const state = String(data.shipping_origin_draft_state || "").trim().toUpperCase();
    const street = String(data.shipping_origin_draft_street || "").trim();
    const neighborhood = String(data.shipping_origin_draft_neighborhood || "").trim();
    if (!street || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{8}$/.test(postalCode)) {
      throw new Error("O endereço de origem ativado está incompleto. Revise as configurações de entrega.");
    }
    const postal = await resolvePostalCode(postalCode);
    if (postal.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() !== city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
      || postal.state !== state) {
      throw new Error("O CEP cadastrado para a origem não corresponde à cidade/UF configurada. Revise o endereço de entrega.");
    }
    // Use the configured storefront street, number and neighborhood for geocoding.
    // CEP is used to validate city/state, not to replace the actual storefront address.
    const number = String(data.shipping_origin_draft_number || "").trim();
    return {
      ...postal,
      address: [street, number].filter(Boolean).join(", "),
      neighborhood: neighborhood || postal.neighborhood,
    };
  }
  const postalCode = String(data?.shipping_origin_postal_code || "").replace(/\D/g, "");
  const postal = await resolvePostalCode(postalCode);
  if (postal.city !== "Palmas" || postal.state !== "TO") {
    throw new Error("O CEP de origem da loja não corresponde a Palmas/TO.");
  }
  return postal;
}

async function getDestinationAddress(shipping: any): Promise<AddressParts> {
  const postalCode = String(shipping.postal_code || "").replace(/\D/g, "");
  const postal = await resolvePostalCode(postalCode);
  const city = String(shipping.city || "").trim();
  const state = String(shipping.state || "").trim().toUpperCase();
  const normalizedCity = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (normalizedCity(postal.city) !== normalizedCity(city) || postal.state !== state) {
    throw new Error("O CEP informado não corresponde à cidade e ao estado do endereço. Confira os dados de entrega.");
  }
  // Geocode the actual address typed by the customer. The previous code used only
  // ViaCEP's street, so different delivery addresses could resolve to the same point.
  const street = String(shipping.address || "").trim();
  const number = String(shipping.number || "").trim();
  const neighborhood = String(shipping.neighborhood || "").trim();
  return {
    ...postal,
    address: [street, number].filter(Boolean).join(", "),
    neighborhood: neighborhood || postal.neighborhood,
  };
}

async function routeDistanceKm(destinationQuery: any) {
  const apiKey = Deno.env.get("ORS_API_KEY");
  if (!apiKey) throw new Error("O cálculo de rotas ainda não está configurado no servidor (ORS_API_KEY).");
  const [originAddress, destinationAddress] = await Promise.all([
    getStoreOriginAddress(),
    getDestinationAddress(destinationQuery),
  ]);
  const [origin, destination] = await Promise.all([
    geocodeAddress(originAddress, apiKey),
    geocodeAddress(destinationAddress, apiKey),
  ]);
  if (Math.abs(origin[0] - destination[0]) < 0.00001 && Math.abs(origin[1] - destination[1]) < 0.00001) {
    throw new Error("O mapa localizou a origem e o destino no mesmo ponto. Confira o endereço de entrega para evitar um frete incorreto.");
  }
  const response = await fetchWithTimeout("https://api.heigit.org/openrouteservice/v2/directions/driving-car", {
    method: "POST",
    headers: { "Authorization": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ coordinates: [origin, destination], instructions: false }),
  }, ROUTE_TIMEOUT_MS, "directions");
  if (response.status === 429) throw new Error("O serviço de rotas está temporariamente ocupado. Aguarde um pouco e tente novamente.");
  if (response.status === 401 || response.status === 403) throw new Error("A configuração da API de rotas precisa ser verificada.");
  if (!response.ok) throw new Error("Não foi possível calcular a rota pelas ruas. Tente novamente.");
  const data = await response.json();
  const meters = Number(data?.routes?.[0]?.summary?.distance);
  if (!Number.isFinite(meters) || meters <= 0) throw new Error("Não foi possível obter a distância da rota.");
  return Number((meters / 1000).toFixed(1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: JSON_HEADERS });
  const requestStartedAt = Date.now();
  try {
    const body = await req.json();
    const shipping = body?.shipping || {};
    const city = String(shipping.city || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const state = String(shipping.state || "").trim().toUpperCase();
    const postalCode = String(shipping.postal_code || "").replace(/\D/g, "");
    if (city !== "PALMAS" || state !== "TO") throw new Error("O cálculo automático por rota está disponível somente para Palmas-TO.");
    if (!/^\d{8}$/.test(postalCode)) throw new Error("CEP inválido.");
    if (!String(shipping.address || "").trim() || !String(shipping.number || "").trim() || !String(shipping.neighborhood || "").trim()) {
      throw new Error("Preencha logradouro, número e bairro para calcular a rota.");
    }
    const distance_km = await routeDistanceKm(shipping);
    timedLog("total", requestStartedAt, { outcome: "success" });
    return new Response(JSON.stringify({ distance_km, method: "openrouteservice-road-route" }), { headers: JSON_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível calcular o frete.";
    console.error(JSON.stringify({ event: "shipping_calculation_error", message }));
    timedLog("total", requestStartedAt, { outcome: "error", message });
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: JSON_HEADERS });
  }
});
