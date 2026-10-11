import { createClient } from "npm:@supabase/supabase-js@2";
import { WebhookSignatureValidator } from "npm:mercadopago";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") || "";
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const key = Deno.env.get("MP_WEBHOOK_KEY") || "";

  if (!dataId || !signature || !requestId || !key) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Only signature-validation failures are authentication errors. Do not turn
  // transient database/API failures into 401 responses, which can obscure
  // operational problems and prevent the provider from retrying correctly.
  try {
    WebhookSignatureValidator.validate({
      xSignature: signature,
      xRequestId: requestId,
      dataId,
      secret: key,
    });
  } catch (error) {
    console.error("Invalid Mercado Pago webhook signature", error);
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const token = Deno.env.get("MP_ACCESS_TOKEN") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!token || !supabaseUrl || !serviceKey) {
      return new Response("Not configured", { status: 503 });
    }

    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!paymentRes.ok) {
      console.error("Mercado Pago payment lookup failed", paymentRes.status);
      return new Response("Payment lookup failed", { status: 502 });
    }
    const payment = await paymentRes.json();

    // Use only the payment fetched from Mercado Pago, never the webhook body,
    // as the source of truth for status, amount, currency, and order reference.
    if (String(payment.id || "") !== dataId) {
      console.error("Mercado Pago payment ID mismatch", { dataId, paymentId: payment.id });
      return new Response("Payment ID mismatch", { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const paymentId = String(payment.id);
    const status = String(payment.status || "").toLowerCase();
    const ref = String(payment.external_reference || "").trim();
    if (!ref) return new Response("ok");

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,payment_status,total_amount")
      .eq("order_number", ref)
      .maybeSingle();

    if (orderError) {
      console.error("Failed to load order for Mercado Pago webhook", orderError);
      return new Response("Order lookup failed", { status: 500 });
    }
    // Unknown references are not actionable; acknowledge them to avoid endless
    // retries for payments that do not belong to this store.
    if (!order) return new Response("ok");

    const { error: eventError } = await admin.from("payment_events").upsert({
      order_id: order.id,
      provider: "mercadopago",
      provider_event_id: paymentId,
      event_type: status || "unknown",
      payload: payment,
    }, { onConflict: "provider,provider_event_id" });

    if (eventError) {
      console.error("Failed to record Mercado Pago payment event", eventError);
      return new Response("Payment event persistence failed", { status: 500 });
    }

    const expectedAmount = Number(order.total_amount);
    const receivedAmount = Number(payment.transaction_amount);
    if (payment.currency_id !== "BRL") {
      console.error("Currency mismatch", { currency: payment.currency_id, order: ref });
      await admin.from("payment_events")
        .update({ event_type: "currency_mismatch" })
        .eq("provider", "mercadopago")
        .eq("provider_event_id", paymentId);
      return new Response("ok");
    }

    if (!Number.isFinite(expectedAmount) || !Number.isFinite(receivedAmount) ||
        Math.abs(receivedAmount - expectedAmount) > 0.01) {
      console.error("Amount mismatch", { expectedAmount, receivedAmount, order: ref });
      await admin.from("payment_events")
        .update({ event_type: "amount_mismatch" })
        .eq("provider", "mercadopago")
        .eq("provider_event_id", paymentId);
      return new Response("ok");
    }

    if (status === "approved") {
      // Atomic, service-role-only transition guarded by a row lock.
      const { data: paid, error: paidError } = await admin.rpc("mark_order_paid_service", {
        p_order_id: order.id,
      });
      if (paidError) {
        console.error("Failed to mark order as paid", paidError);
        return new Response("Database update failed", { status: 500 });
      }
      if (!paid) console.log("Ignoring duplicate/non-pending approved notification", ref);
    } else if (status === "refunded") {
      const { data: refunded, error: refundError } = await admin.rpc("mark_order_refunded_webhook_service", {
        p_order_id: order.id,
      });
      if (refundError) {
        console.error("Failed to reconcile Mercado Pago refund", refundError);
        return new Response("Database update failed", { status: 500 });
      }
      if (!refunded) console.log("Ignoring duplicate/non-paid refund notification", ref);
    } else if (status === "rejected" || status === "cancelled") {
      // Atomic transition: lock the order, restore stock if reserved, and
      // cancel the payment in one database transaction.
      const { data: cancelled, error: cancelError } = await admin.rpc("cancel_order_payment_service", {
        p_order_id: order.id,
        p_payment_status: status.toUpperCase(),
      });
      if (cancelError) {
        console.error("Failed to atomically cancel order", cancelError);
        return new Response("Database update failed", { status: 500 });
      }
      if (!cancelled) console.log("Ignoring duplicate/non-pending cancellation notification", ref);
    }

    return new Response("ok");
  } catch (error) {
    console.error("Unexpected Mercado Pago webhook failure", error);
    return new Response("Internal webhook error", { status: 500 });
  }
});
