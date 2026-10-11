import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let admin: ReturnType<typeof createClient> | null = null;
  let claimedOrderId: string | null = null;
  let activeClaimToken: string | null = null;
  let preferenceCreationAttempted = false;
  try {
    const { order_number, email } = await req.json();
    if (!order_number || !email) {
      return Response.json({ error: "Pedido e e-mail são obrigatórios" }, { status: 400, headers: cors });
    }

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL");

    if (!serviceKey || !supabaseUrl || !accessToken || !siteUrl) {
      return Response.json({ error: "Pagamento ainda não configurado no servidor" }, { status: 503, headers: cors });
    }

    admin = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number,customer_name,customer_email,customer_phone,shipping_address,total_amount,shipping_amount,discount_amount,status,payment_status,payment_provider,payment_provider_id,payment_url")
      .eq("order_number", order_number)
      .eq("customer_email", String(email).trim().toLowerCase())
      .single();

    if (orderError || !order) return Response.json({ error: "Pedido não encontrado" }, { status: 404, headers: cors });
    if (order.payment_status === "PAID") return Response.json({ error: "Este pedido já foi pago" }, { status: 409, headers: cors });
    if (order.payment_status === "PENDING" && order.payment_provider === "mercadopago" && order.payment_provider_id && order.payment_url) {
      return Response.json({ init_point: order.payment_url, preference_id: order.payment_provider_id, reused: true }, { headers: cors });
    }
    if (["CANCELLED", "REFUNDED"].includes(String(order.status))) {
      return Response.json({ error: "Este pedido não pode receber pagamento" }, { status: 409, headers: cors });
    }

    // Claim payment-preference creation atomically. This closes the race where
    // two rapid clicks both observe an order without a Mercado Pago preference.
    const claimToken = crypto.randomUUID();
    activeClaimToken = claimToken;
    const { data: claimedOrder, error: claimError } = await admin
      .from("orders")
      .update({
        payment_creation_token: claimToken,
        payment_creation_started_at: new Date().toISOString()
      })
      .eq("id", order.id)
      .eq("payment_status", "PENDING")
      .is("payment_provider_id", null)
      .or("payment_creation_token.is.null,payment_creation_started_at.lt." + new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("Falha ao reservar criação do pagamento", claimError);
      return Response.json({ error: "Não foi possível iniciar o pagamento" }, { status: 500, headers: cors });
    }

    if (!claimedOrder) {
      activeClaimToken = null;
      // Another request is currently creating the preference. Give it a few
      // seconds to finish, then return the persisted preference if available.
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { data: current } = await admin
          .from("orders")
          .select("payment_status,payment_provider,payment_provider_id,payment_url")
          .eq("id", order.id)
          .single();

        if (current?.payment_status === "PENDING" &&
            current.payment_provider === "mercadopago" &&
            current.payment_provider_id &&
            current.payment_url) {
          return Response.json({
            init_point: current.payment_url,
            preference_id: current.payment_provider_id,
            reused: true
          }, { headers: cors });
        }

        if (current?.payment_status !== "PENDING") break;
      }

      return Response.json({ error: "O pagamento está sendo preparado. Tente novamente em alguns segundos." }, { status: 409, headers: cors });
    }

    claimedOrderId = order.id;

    const releaseClaim = async () => {
      if (!admin || !claimedOrderId || !activeClaimToken) return;
      const { error } = await admin.from("orders")
        .update({ payment_creation_token: null, payment_creation_started_at: null })
        .eq("id", claimedOrderId)
        .eq("payment_creation_token", activeClaimToken);
      if (error) console.error("Falha ao liberar reserva de pagamento", error);
      else activeClaimToken = null;
    };

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("product_name,quantity,unit_price")
      .eq("order_id", order.id);

    if (itemsError || !items?.length) {
      await releaseClaim();
      return Response.json({ error: "Itens do pedido não encontrados" }, { status: 400, headers: cors });
    }

    const itemsTotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
    const discountAmount = Math.max(0, Number(order.discount_amount || 0));
    const expectedTotal = itemsTotal - discountAmount + Number(order.shipping_amount || 0);
    if (Math.abs(expectedTotal - Number(order.total_amount)) > 0.01) {
      console.error("Pedido com total inconsistente", { order: order.order_number, expectedTotal, total: order.total_amount });
      await releaseClaim();
      return Response.json({ error: "Total do pedido inconsistente" }, { status: 409, headers: cors });
    }

    // O Checkout Pro soma os itens enviados. Para preservar exatamente o total do pedido
    // com cupom, distribuímos o desconto nas unidades dos produtos, sem enviar preços negativos.
    let remainingDiscountCents = Math.round(discountAmount * 100);
    const paymentItems: Array<{ title: string; quantity: number; unit_price: number; currency_id: string }> = [];
    for (const item of items) {
      const quantity = Number(item.quantity);
      const originalUnitCents = Math.round(Number(item.unit_price) * 100);
      if (remainingDiscountCents <= 0) {
        paymentItems.push({ title: item.product_name, quantity, unit_price: originalUnitCents / 100, currency_id: "BRL" });
        continue;
      }
      const lineCents = originalUnitCents * quantity;
      const lineDiscount = Math.min(remainingDiscountCents, lineCents);
      const adjustedLineCents = lineCents - lineDiscount;
      const baseUnitCents = Math.floor(adjustedLineCents / quantity);
      let remainder = adjustedLineCents - baseUnitCents * quantity;
      for (let unit = 0; unit < quantity; unit++) {
        const unitCents = baseUnitCents + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        paymentItems.push({ title: item.product_name, quantity: 1, unit_price: unitCents / 100, currency_id: "BRL" });
      }
      remainingDiscountCents -= lineDiscount;
    }
    if (remainingDiscountCents > 0) {
      await releaseClaim();
      return Response.json({ error: "Desconto do pedido excede o valor dos produtos" }, { status: 409, headers: cors });
    }

    const shippingAddress = order.shipping_address && typeof order.shipping_address === "object" ? order.shipping_address as Record<string, unknown> : {};
    const recipientCpf = String(shippingAddress.recipient_code || "").replace(/\D/g, "");
    const payer: Record<string, unknown> = { name: order.customer_name, email: order.customer_email };
    if (recipientCpf.length === 11) payer.identification = { type: "CPF", number: recipientCpf };

    // Once the network request starts, a timeout may mean Mercado Pago created
    // the preference even if this function did not receive its response. Keep
    // the lease in that uncertain case to avoid creating duplicate preferences.
    preferenceCreationAttempted = true;
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          ...paymentItems,
          ...(Number(order.shipping_amount) > 0 ? [{
            title: "Frete",
            quantity: 1,
            unit_price: Number(order.shipping_amount),
            currency_id: "BRL",
          }] : []),
        ],
        payer,
        external_reference: order.order_number,
        back_urls: {
          success: `${siteUrl}/loja/pedido?status=success&order=${encodeURIComponent(order.order_number)}`,
          pending: `${siteUrl}/loja/pedido?status=pending&order=${encodeURIComponent(order.order_number)}`,
          failure: `${siteUrl}/loja/pedido?status=failure&order=${encodeURIComponent(order.order_number)}`,
        },
        auto_return: "approved",
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      }),
    });

    const preference = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error("Mercado Pago:", preference);
      await releaseClaim();
      return Response.json({ error: "Mercado Pago recusou a preferência" }, { status: 502, headers: cors });
    }

    // Persist with bounded retries. The preference already exists remotely,
    // so retry only the database write and never create another preference here.
    let saved = false;
    let lastSaveError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: savedOrder, error: saveError } = await admin
        .from("orders")
        .update({
          payment_provider: "mercadopago",
          payment_provider_id: preference.id,
          payment_url: preference.init_point,
          payment_status: "PENDING",
          payment_creation_token: null,
          payment_creation_started_at: null,
        })
        .eq("id", order.id)
        .eq("payment_status", "PENDING")
        .eq("payment_creation_token", claimToken)
        .select("id")
        .maybeSingle();

      if (!saveError && savedOrder) {
        saved = true;
        activeClaimToken = null;
        break;
      }

      lastSaveError = saveError;
      // The write may have succeeded even if the response was lost. Confirm
      // that this exact preference is already stored before attempting again.
      const { data: currentOrder, error: verifyError } = await admin
        .from("orders")
        .select("payment_provider,payment_provider_id,payment_url,payment_status")
        .eq("id", order.id)
        .maybeSingle();

      if (!verifyError &&
          currentOrder?.payment_status === "PENDING" &&
          currentOrder.payment_provider === "mercadopago" &&
          String(currentOrder.payment_provider_id) === String(preference.id) &&
          currentOrder.payment_url === preference.init_point) {
        saved = true;
        activeClaimToken = null;
        break;
      }

      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }

    if (!saved) {
      console.error("Não foi possível persistir a preferência criada após novas tentativas", lastSaveError);
      // Keep the claim: the remote preference exists and must be reconciled
      // rather than risking a duplicate charge/preference.
      return Response.json({ error: "O pagamento foi iniciado, mas não conseguimos confirmar o registro. Aguarde e tente novamente." }, { status: 500, headers: cors });
    }

    return Response.json({ init_point: preference.init_point, preference_id: preference.id }, { headers: cors });
  } catch (error) {
    console.error(error);
    // Release only if we failed before contacting Mercado Pago. After the POST
    // starts, the remote result can be ambiguous and the lease prevents duplicates.
    if (!preferenceCreationAttempted && admin && claimedOrderId && activeClaimToken) {
      const { error: releaseError } = await admin.from("orders")
        .update({ payment_creation_token: null, payment_creation_started_at: null })
        .eq("id", claimedOrderId)
        .eq("payment_creation_token", activeClaimToken);
      if (releaseError) console.error("Falha ao liberar reserva após erro", releaseError);
    }
    return Response.json({ error: "Erro interno ao preparar pagamento" }, { status: 500, headers: cors });
  }
});
