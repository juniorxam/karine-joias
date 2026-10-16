import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function geocodeAddress(query: string, apiKey: string) {
  const url = "https://api.openrouteservice.org/geocode/search?text=" + encodeURIComponent(query) + "&boundary.country=BR&size=1";
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
  const [origin, destination] = await Promise.all([geocodeAddress(originQuery, apiKey), geocodeAddress(destinationQuery, apiKey)]);
  const response = await fetch("https://api.heigit.org/openrouteservice/v2/directions/driving-car", {
    method: "POST",
    headers: { "Authorization": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ coordinates: [origin, destination], instructions: false }),
  });
  if (!response.ok) throw new Error("Não foi possível calcular a rota pelas ruas. Tente novamente.");
  const data = await response.json();
  const meters = Number(data?.routes?.[0]?.summary?.distance);
  if (!Number.isFinite(meters) || meters <= 0) throw new Error("Não foi possível obter a distância da rota.");
  return Number((meters / 1000).toFixed(1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json();
    const shipping = body?.shipping || {};
    const city = String(shipping.city || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const state = String(shipping.state || "").trim().toUpperCase();
    const postalCode = String(shipping.postal_code || "").replace(/\D/g, "");
    if (city !== "PALMAS" || state !== "TO") throw new Error("O cálculo automático por rota está disponível somente para Palmas-TO.");
    if (!/^\d{8}$/.test(postalCode)) throw new Error("CEP inválido.");
    if (!String(shipping.address || "").trim() || !String(shipping.number || "").trim() || !String(shipping.neighborhood || "").trim()) throw new Error("Preencha logradouro, número e bairro para calcular a rota.");
    const originQuery = await getStoreOriginQuery();
    const distance_km = await routeDistanceKm(originQuery, buildDestinationQuery({ ...shipping, postal_code: postalCode }));
    return new Response(JSON.stringify({ distance_km, method: "openrouteservice-road-route" }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível calcular o frete.";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
