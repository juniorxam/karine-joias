import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const code = String(body.code || "").trim().toUpperCase();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!code) throw new Error("Informe o cupom");
    if (!items.length || items.length > 30) throw new Error("Carrinho inválido");

    const url = Deno.env.get("SUPABASE_URL")!;
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const key = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Servidor não configurado");
    const db = createClient(url, key);

    const ids = items.map((item: any) => Number(item.product_id));
    const quantities = new Map<number, number>();
    for (const item of items) {
      const id = Number(item.product_id);
      const qty = Number(item.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) throw new Error("Carrinho inválido");
      quantities.set(id, (quantities.get(id) || 0) + qty);
    }

    const { data: products, error: productError } = await db
      .from("products")
      .select("id,price,active,owner_id")
      .in("id", Array.from(quantities.keys()));
    if (productError) throw productError;
    if (!products || products.length !== quantities.size || products.some((p: any) => p.active === false)) {
      throw new Error("Produto indisponível");
    }

    const owners = [...new Set(products.map((p: any) => String(p.owner_id)))];
    if (owners.length !== 1) throw new Error("Carrinho inválido");
    const ownerId = owners[0];
    const subtotal = products.reduce((sum: number, p: any) => sum + Number(p.price) * (quantities.get(Number(p.id)) || 0), 0);

    const { data, error } = await db.rpc("preview_store_coupon", {
      p_owner_id: ownerId,
      p_code: code,
      p_subtotal: Math.round(subtotal * 100) / 100,
      p_shipping: Math.max(0, Number(body.shipping_amount) || 0),
      p_phone: String(body.phone || ""),
      p_email: String(body.email || ""),
      p_cpf: String(body.cpf || ""),
    });
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: e instanceof Error ? e.message : "Cupom inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
