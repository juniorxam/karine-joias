import { createClient } from "npm:@supabase/supabase-js@2";
import { WebhookSignatureValidator } from "npm:mercadopago";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const dataId = url.searchParams.get("data.id") || "";
    const signature = req.headers.get("x-signature") || "";
    const requestId = req.headers.get("x-request-id") || "";
    const key = Deno.env.get("MP_WEBHOOK_KEY") || "";
    if (!dataId || !signature || !key) return new Response("Unauthorized", { status: 401 });

    WebhookSignatureValidator.validate({ xSignature: signature, xRequestId: requestId, dataId, secret: key });

    const token = Deno.env.get("MP_ACCESS_TOKEN") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!token || !supabaseUrl || !serviceKey) return new Response("Not configured", { status: 503 });

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const payment = await paymentRes.json();
    if (!paymentRes.ok) return new Response("Payment lookup failed", { status: 502 });

    const admin = createClient(supabaseUrl, serviceKey);
    const ref = payment.external_reference;
    if (!ref) return new Response("ok");

    const { data: order } = await admin.from("orders").select("id,payment_status,total_amount").eq("order_number", ref).single();
    if (!order) return new Response("ok");

    await admin.from("payment_events").upsert({
      order_id: order.id,
      provider: "mercadopago",
      provider_event_id: String(payment.id),
      event_type: payment.status || "unknown",
      payload: payment
    }, { onConflict: "provider,provider_event_id" });

    const status = payment.status;
    const expectedAmount = Number(order.total_amount);
    const receivedAmount = Number(payment.transaction_amount);
    if (payment.currency_id && payment.currency_id !== "BRL") {
      console.error("Currency mismatch", payment.currency_id);
      return new Response("ok");
    }
    if (!Number.isFinite(receivedAmount) || Math.abs(receivedAmount - expectedAmount) > 0.01) {
      console.error("Amount mismatch", { expectedAmount, receivedAmount, order: ref });
      await admin.from("payment_events").update({ event_type: "amount_mismatch" }).eq("provider","mercadopago").eq("provider_event_id",String(payment.id));
      return new Response("ok");
    }
    if (status === "approved") {
      // Idempotent transition: a repeated Mercado Pago notification must not
      // rewrite an already processed order or race a second state transition.
      const { data: updatedOrder, error: updateError } = await admin
        .from("orders")
        .update({
          payment_status: "PAID",
          status: "PAID",
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id)
        .eq("payment_status", "PENDING")
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error("Failed to mark order as paid", updateError);
        return new Response("Database update failed", { status: 500 });
      }

      if (!updatedOrder) {
        console.log("Ignoring duplicate/non-pending approved notification", ref);
      }

    } else if (status === "rejected" || status === "cancelled") {
      // Atomic transition: lock the order, restore stock if reserved, and
      // cancel the payment in one database transaction. This avoids the
      // previous gap where stock could be restored but the order update fail.
      const { data: cancelled, error: cancelError } = await admin.rpc("cancel_order_payment_service", {
        p_order_id: order.id,
        p_payment_status: String(status).toUpperCase()
      });

      if (cancelError) {
        console.error("Failed to atomically cancel order", cancelError);
        return new Response("Database update failed", { status: 500 });
      }

      if (!cancelled) {
        console.log("Ignoring duplicate/non-pending cancellation notification", ref);
      }
    }

    return new Response("ok");
  } catch (error) {
    console.error(error);
    return new Response("Invalid webhook", { status: 401 });
  }
});
