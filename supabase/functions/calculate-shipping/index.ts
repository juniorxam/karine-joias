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
  const key=Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
  if(!key) throw new Error("Google Maps não está configurado no servidor. O frete não foi calculado.");
  const full=[address.street,address.number,address.neighborhood,address.city,address.state,address.postalCode,"Brasil"].filter(Boolean).join(", ");
  const p=new URLSearchParams({address:full,components:`country:BR|postal_code:${address.postalCode}`,key,language:"pt-BR",region:"br"});
  const response=await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${p}`);
  if(!response.ok) throw new Error("O Google Maps não conseguiu localizar o endereço.");
  const data=await response.json();
  if(data?.status!=="OK"||!Array.isArray(data.results)) throw new Error(data?.status==="REQUEST_DENIED"?"A chave ou as permissões da API do Google Maps precisam ser verificadas.":"O Google Maps não localizou o endereço. Confira os dados.");
  const candidates=data.results.map((item:any)=>{
    const cs=Array.isArray(item.address_components)?item.address_components:[];
    const get=(type:string,short=false)=>{const x=cs.find((z:any)=>z.types?.includes(type));return x?(short?x.short_name:x.long_name):"";};
    return {lat:Number(item.geometry?.location?.lat),lon:Number(item.geometry?.location?.lng),city:norm(get("locality")||get("postal_town")||get("administrative_area_level_2")),state:norm(get("administrative_area_level_1",true)||get("administrative_area_level_1")),country:norm(get("country",true)||get("country")),postal:dig(get("postal_code")),label:norm(item.formatted_address||"")};
  });
  const words=norm(address.street).split(/[^a-z0-9]+/).filter((w)=>w.length>=3&&!/^\d+$/.test(w));
  const found=candidates.find((x:any)=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&x.lon>=box.minLon&&x.lon<=box.maxLon&&x.lat>=box.minLat&&x.lat<=box.maxLat&&(x.city===norm(address.city)||x.city.includes(norm(address.city)))&&(x.state==="to"||x.state.includes("tocantins"))&&(x.country==="br"||x.country.includes("brasil"))&&(!x.postal||x.postal===address.postalCode)&&(words.length===0||words.some((w:string)=>x.label.includes(w))));
  if(!found) throw new Error("O resultado do Google Maps não corresponde com segurança ao CEP, logradouro e município. O frete não foi calculado.");
  return {lon:found.lon,lat:found.lat,source:"Google Maps Geocoding API"};
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


async function route(origin: GeoPoint, destination: GeoPoint) {
  const directKm=straightLineKm(origin,destination);
  if(!Number.isFinite(directKm)||directKm<0.01) throw new Error("A localização do endereço não parece válida.");
  const key=Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
  if(!key) throw new Error("Google Maps não está configurado no servidor. O frete não foi calculado.");
  const response=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"routes.distanceMeters,routes.duration"},body:JSON.stringify({origin:{location:{latLng:{latitude:origin.lat,longitude:origin.lon}}},destination:{location:{latLng:{latitude:destination.lat,longitude:destination.lon}}},travelMode:"DRIVE",routingPreference:"TRAFFIC_UNAWARE",units:"METRIC"})});
  if(!response.ok) throw new Error("O Google Maps não conseguiu calcular a rota. O frete não foi definido.");
  const data=await response.json(), meters=Number(data?.routes?.[0]?.distanceMeters), seconds=Number(String(data?.routes?.[0]?.duration||"").replace(/s$/,""));
  if(!Number.isFinite(meters)||meters<=0||!Number.isFinite(seconds)||seconds<=0) throw new Error("O Google Maps retornou uma rota incompleta. O frete não foi calculado.");
  const routeKm=meters/1000,tolerance=Math.max(0.2,directKm*0.03),ratio=routeKm/directKm;
  if(routeKm+tolerance<directKm||!Number.isFinite(ratio)||ratio<0.97||ratio>4.5) throw new Error("A rota não passou pela validação da distância em linha reta. O frete não foi calculado.");
  return {km:Number(routeKm.toFixed(2)),straight_line_km:Number(directKm.toFixed(2)),min:Math.max(1,Math.round(seconds/60)),route_ratio:Number(ratio.toFixed(2)),provider:"Google Routes API",origin_geocoder:origin.source,destination_geocoder:destination.source};
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
