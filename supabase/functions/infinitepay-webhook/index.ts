import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const body = await req.json();
    const orderNumber = String(body?.order_nsu || "").trim();
    const transactionNsu = String(body?.transaction_nsu || "").trim();
    const slug = String(body?.invoice_slug || body?.slug || "").trim();
    if (!orderNumber || !transactionNsu || !slug) return json({ error: "Dados de pagamento incompletos" }, 400);

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const handle = (Deno.env.get("INFINITEPAY_HANDLE") || "violettaprataesemijoias").replace(/^\$/, "").trim();
    if (!serviceKey || !supabaseUrl || !handle) return json({ error: "Webhook não configurado" }, 503);
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: order, error: orderError } = await admin.from("orders")
      .select("id,order_number,total_amount,payment_status,payment_provider").eq("order_number", orderNumber).maybeSingle();
    if (orderError) {
      console.error("Falha ao consultar pedido InfinitePay", orderError);
      return json({ error: "Falha ao consultar pedido" }, 500);
    }
    if (!order) return json({ error: "Pedido não encontrado" }, 400);

    // A notificação recebida não é considerada prova de pagamento.
    // O endpoint oficial payment_check é a fonte de verdade.
    const checkResponse = await fetch("https://api.checkout.infinitepay.io/payment_check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ handle, order_nsu: orderNumber, transaction_nsu: transactionNsu, slug }),
    });
    const checked = await checkResponse.json().catch(() => ({}));
    if (!checkResponse.ok || checked?.success !== true) {
      console.error("InfinitePay payment_check failed", checkResponse.status);
      return json({ error: "Não foi possível validar o pagamento" }, 502);
    }
    if (checked.paid !== true) return json({ error: "Pagamento ainda não confirmado" }, 400);

    const expectedCents = Math.round(Number(order.total_amount) * 100);
    const receivedCents = Number(checked.amount);
    const eventPayload = {
      ...body,
      provider: "infinitepay",
      verified: { success: checked.success, paid: checked.paid, amount: checked.amount, paid_amount: checked.paid_amount, installments: checked.installments, capture_method: checked.capture_method },
    };
    const eventId = transactionNsu || slug;
    const amountMatches = Number.isFinite(expectedCents) && Number.isFinite(receivedCents) && receivedCents === expectedCents;
    const { error: eventError } = await admin.from("payment_events").upsert({
      order_id: order.id,
      provider: "infinitepay",
      provider_event_id: eventId,
      event_type: amountMatches ? "paid_verified" : "amount_mismatch",
      payload: eventPayload,
    }, { onConflict: "provider,provider_event_id" });
    if (eventError) {
      console.error("Falha ao registrar evento InfinitePay", eventError);
      return json({ error: "Falha ao registrar evento de pagamento" }, 500);
    }
    if (!amountMatches) {
      console.error("InfinitePay amount mismatch", { orderNumber, expectedCents, receivedCents });
      return json({ success: true, paid: false, message: "Valor divergente; pedido não marcado como pago" });
    }

    if (String(order.payment_status).toUpperCase() !== "PAID") {
      const { data: markedPaid, error: markError } = await admin.rpc("mark_order_paid_service", { p_order_id: order.id });
      if (markError) {
        console.error("Falha ao marcar pedido como pago", markError);
        return json({ error: "Falha ao atualizar pedido" }, 500);
      }
      if (!markedPaid) console.log("Pedido já pago ou transição ignorada", orderNumber);
    }
    const method = String(checked.capture_method || body.capture_method || "unknown").toLowerCase();
    const { error: detailsError } = await admin.from("orders").update({
      payment_provider: "infinitepay",
      payment_provider_id: transactionNsu,
      payment_method: method,
    }).eq("id", order.id);
    if (detailsError) {
      console.error("Falha ao salvar detalhes InfinitePay", detailsError);
      return json({ error: "Pagamento validado, mas os detalhes não foram salvos" }, 500);
    }
    return json({ success: true, paid: true });
  } catch (error) {
    console.error("InfinitePay webhook error", error);
    return json({ error: "Erro interno ao processar webhook" }, 500);
  }
});
