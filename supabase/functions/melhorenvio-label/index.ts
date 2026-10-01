import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const apiBase = "https://www.melhorenvio.com.br/api/v2/me";

function findUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const key of ["url", "link", "label_url", "print_url"]) {
    if (typeof obj[key] === "string" && /^https?:\\/\\//.test(obj[key] as string)) return obj[key] as string;
  }
  for (const value of Object.values(obj)) {
    const found = findUrl(value);
    if (found) return found;
  }
  return null;
}

async function melhor(path: string, token: string, userAgent: string, body: unknown) {
  return fetch(apiBase + path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autorizado" }, 401);

    const token = Deno.env.get("MELHOR_ENVIO_TOKEN");
    const userAgent = Deno.env.get("MELHOR_ENVIO_USER_AGENT");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !userAgent || !supabaseUrl || !serviceKey) {
      return json({ error: "Configuração do Melhor Envio incompleta" }, 503);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: auth } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida" }, 401);

    const payload = await req.json().catch(() => ({}));
    const orderId = String(payload?.order_id ?? "").trim();
    const action = String(payload?.action ?? "").trim().toLowerCase();
    if (!orderId || !["buy", "generate", "print"].includes(action)) {
      return json({ error: "order_id e action (buy, generate ou print) são obrigatórios" }, 400);
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,owner_id,status")
      .eq("id", orderId)
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Pedido não encontrado" }, 404);

    const { data: shipment, error: shipmentError } = await supabase
      .from("shipments")
      .select("id,order_id,melhor_envio_order_id,melhor_envio_label_status,melhor_envio_checkout_started_at,label_url,tracking_code")
      .eq("order_id", orderId)
      .maybeSingle();
    if (shipmentError) throw shipmentError;
    if (!shipment?.melhor_envio_order_id) return json({ error: "O envio ainda não foi criado no Melhor Envio" }, 400);

    const meId = shipment.melhor_envio_order_id;

    if (action === "buy") {
      if (shipment.melhor_envio_label_status === "purchased" || shipment.melhor_envio_label_status === "generated") {
        return json({ ok: true, status: shipment.melhor_envio_label_status, already_done: true });
      }
      if (shipment.melhor_envio_label_status === "checkout_processing") {
        const started = shipment.melhor_envio_checkout_started_at ? new Date(shipment.melhor_envio_checkout_started_at).getTime() : 0;
        if (started && Date.now() - started < 10 * 60 * 1000) {
          return json({ error: "A compra da etiqueta já está em processamento. Aguarde alguns minutos antes de tentar novamente." }, 409);
        }
      }

      const { data: claimed, error: claimError } = await supabase
        .from("shipments")
        .update({ melhor_envio_label_status: "checkout_processing", melhor_envio_checkout_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", shipment.id)
        .in("melhor_envio_label_status", ["cart", "checkout_processing"])
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json({ error: "Não foi possível reservar a compra da etiqueta. Atualize e tente novamente." }, 409);

      const response = await melhor("/shipment/checkout", token, userAgent, { orders: [meId] });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        await supabase.from("shipments").update({ melhor_envio_label_status: "cart", melhor_envio_checkout_started_at: null, updated_at: new Date().toISOString() }).eq("id", shipment.id);
        return json({ error: data?.message ?? data?.error ?? "O Melhor Envio recusou a compra da etiqueta", details: data }, response.status >= 400 && response.status < 500 ? response.status : 502);
      }

      await supabase.from("shipments").update({
        melhor_envio_label_status: "purchased",
        melhor_envio_checkout_started_at: null,
        melhor_envio_label_purchased_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", shipment.id);

      return json({ ok: true, status: "purchased", response: data });
    }

    if (action === "generate") {
      if (!["purchased", "generate_processing"].includes(shipment.melhor_envio_label_status ?? "")) {
        if (shipment.melhor_envio_label_status === "generated") return json({ ok: true, status: "generated", already_done: true });
        return json({ error: "A etiqueta precisa ser comprada antes da geração." }, 400);
      }
      if (shipment.melhor_envio_label_status === "generate_processing") {
        return json({ error: "A geração já foi iniciada. Aguarde alguns segundos e tente novamente." }, 409);
      }

      const { data: claimed, error: claimError } = await supabase
        .from("shipments")
        .update({ melhor_envio_label_status: "generate_processing", updated_at: new Date().toISOString() })
        .eq("id", shipment.id)
        .eq("melhor_envio_label_status", "purchased")
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json({ error: "A geração já foi iniciada. Atualize o pedido." }, 409);

      const response = await melhor("/shipment/generate", token, userAgent, { orders: [meId] });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        await supabase.from("shipments").update({ melhor_envio_label_status: "purchased", updated_at: new Date().toISOString() }).eq("id", shipment.id);
        return json({ error: data?.message ?? data?.error ?? "Não foi possível gerar a etiqueta", details: data }, response.status >= 400 && response.status < 500 ? response.status : 502);
      }

      await supabase.from("shipments").update({
        melhor_envio_label_status: "generated",
        melhor_envio_label_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", shipment.id);

      return json({ ok: true, status: "generated", response: data });
    }

    if (shipment.melhor_envio_label_status !== "generated") {
      return json({ error: "A etiqueta precisa ser gerada antes da impressão." }, 400);
    }

    if (shipment.label_url) return json({ ok: true, status: "generated", label_url: shipment.label_url, already_done: true });

    const response = await melhor("/shipment/print", token, userAgent, { mode: "private", orders: [meId] });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ error: data?.message ?? data?.error ?? "Não foi possível obter o link da etiqueta", details: data }, response.status >= 400 && response.status < 500 ? response.status : 502);
    }

    const labelUrl = findUrl(data);
    if (!labelUrl) return json({ error: "O Melhor Envio não retornou um link de impressão", details: data }, 502);

    await supabase.from("shipments").update({ label_url: labelUrl, updated_at: new Date().toISOString() }).eq("id", shipment.id);
    return json({ ok: true, status: "generated", label_url: labelUrl });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});