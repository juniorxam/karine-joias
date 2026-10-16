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

async function geocodeAddress(query: string, apiKey: string): Promise<[number, number]> {
  const cacheKey = query.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.coordinates;
  const url = "https://api.openrouteservice.org/geocode/search?text=" + encodeURIComponent(query) + "&boundary.country=BR&size=1";
  const response = await fetchWithTimeout(url, { headers: { "Authorization": apiKey, "Accept": "application/json" } }, GEOCODE_TIMEOUT_MS, "geocode");
  if (response.status === 429) throw new Error("O serviço de localização atingiu o limite de consultas. Aguarde um pouco e tente novamente.");
  if (response.status === 401 || response.status === 403) throw new Error("A configuração da API de localização precisa ser verificada.");
  if (!response.ok) throw new Error("Não foi possível localizar um dos endereços no mapa. Confira o CEP e o endereço.");
  const data = await response.json();
  const coordinates = data?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error("O mapa não encontrou coordenadas para este endereço. Confira o CEP e o endereço.");
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("O mapa retornou coordenadas inválidas para este endereço.");
  }
  const result: [number, number] = [lon, lat];
  if (geocodeCache.size > 200) {
    for (const [key, value] of geocodeCache) if (value.expiresAt <= Date.now()) geocodeCache.delete(key);
    if (geocodeCache.size > 200) geocodeCache.clear();
  }
  geocodeCache.set(cacheKey, { coordinates: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

function buildOriginQuery(postalCode: string) {
  const cep = postalCode.replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) throw new Error("O CEP de origem da loja não está configurado corretamente.");
  return cep + ", Palmas, Tocantins, Brasil";
}

async function getStoreOriginQuery() {
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
    const street = String(data.shipping_origin_draft_street || "").trim();
    const number = String(data.shipping_origin_draft_number || "").trim();
    const city = String(data.shipping_origin_draft_city || "").trim();
    const state = String(data.shipping_origin_draft_state || "").trim().toUpperCase();
    if (!street || !number || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{8}$/.test(postalCode)) {
      throw new Error("O endereço de origem ativado está incompleto. Revise as configurações de entrega.");
    }
    return [street, number, data.shipping_origin_draft_neighborhood, city, state, postalCode, "Brasil"]
      .map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
  }
  return buildOriginQuery(String(data?.shipping_origin_postal_code || ""));
}

function buildDestinationQuery(shipping: any) {
  const cep = String(shipping.postal_code || "").replace(/\D/g, "");
  const parts = [shipping.address, shipping.number, shipping.neighborhood, shipping.city, shipping.state, cep, "Brasil"]
    .map((value) => String(value || "").trim()).filter(Boolean);
  if (parts.length < 5) throw new Error("Endereço incompleto para calcular a rota.");
  return parts.join(", ");
}

async function routeDistanceKm(originQuery: string, destinationQuery: string) {
  const apiKey = Deno.env.get("ORS_API_KEY");
  if (!apiKey) throw new Error("O cálculo de rotas ainda não está configurado no servidor (ORS_API_KEY).");
  const [origin, destination] = await Promise.all([
    geocodeAddress(originQuery, apiKey),
    geocodeAddress(destinationQuery, apiKey),
  ]);
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
    const originQuery = await getStoreOriginQuery();
    const distance_km = await routeDistanceKm(originQuery, buildDestinationQuery({ ...shipping, postal_code: postalCode }));
    timedLog("total", requestStartedAt, { outcome: "success" });
    return new Response(JSON.stringify({ distance_km, method: "openrouteservice-road-route" }), { headers: JSON_HEADERS });
  } catch (error) {
    timedLog("total", requestStartedAt, { outcome: "error" });
    const message = error instanceof Error ? error.message : "Não foi possível calcular o frete.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: JSON_HEADERS });
  }
});
