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
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

    const { data: coupon, error: couponError } = await db
      .from("coupons")
      .select("id,code,discount_type,discount_value,min_order_amount,starts_at,expires_at,max_uses,used_count,active,gift_description")
      .eq("code", code)
      .eq("owner_id", ownerId)
      .eq("active", true)
      .maybeSingle();
    if (couponError) throw couponError;
    if (!coupon) throw new Error("Cupom inválido");
    if (coupon.starts_at && Date.now() < new Date(coupon.starts_at).getTime()) throw new Error("Cupom ainda não está disponível");
    if (coupon.expires_at && Date.now() >= new Date(coupon.expires_at).getTime()) throw new Error("Cupom expirado");
    if (coupon.max_uses !== null && Number(coupon.used_count) >= Number(coupon.max_uses)) throw new Error("Cupom esgotado");
    if (subtotal < Number(coupon.min_order_amount)) throw new Error(`Pedido mínimo de ${Number(coupon.min_order_amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para este cupom`);

    const shippingAmount = Math.max(0, Number(body.shipping_amount) || 0);
    const discount = coupon.discount_type === "PERCENT"
      ? Math.min(subtotal, Math.round(subtotal * Number(coupon.discount_value)) / 100)
      : coupon.discount_type === "FREIGHT"
        ? (Number(coupon.discount_value) <= 0 ? shippingAmount : Math.min(shippingAmount, Number(coupon.discount_value)))
        : Math.min(subtotal, Number(coupon.discount_value));

    return new Response(JSON.stringify({
      valid: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      discount_amount: Math.round(discount * 100) / 100,
      subtotal,
      gift_description: coupon.gift_description || null,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ valid: false, error: e instanceof Error ? e.message : "Cupom inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
