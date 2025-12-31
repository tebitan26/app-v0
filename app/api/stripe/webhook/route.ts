import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return new Response("Missing stripe-signature or webhook secret", { status: 400 });
  }

  let evt: Stripe.Event;

  try {
    const body = await req.text();
    evt = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("webhook signature error:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    if (evt.type !== "checkout.session.completed") {
      return new Response("ok", { status: 200 });
    }

    const session = evt.data.object as Stripe.Checkout.Session;

    const orderId = session.metadata?.order_id;
    const batchId = session.metadata?.batch_id;
    const buyerId = session.metadata?.buyer_id; // ✅ ajouté par Patch A
    const attendeeName = session.metadata?.attendee_name || null;

    if (!orderId || !batchId || !buyerId) {
      console.error("Missing metadata", { orderId, batchId, buyerId });
      return new Response("Missing metadata", { status: 400 });
    }

    // 1) Idempotency: si déjà PAID, on stop
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("orders")
      .select("id,status")
      .eq("id", orderId)
      .single();

    if (exErr || !existing) {
      console.error("Order not found", exErr?.message);
      return new Response("Order not found", { status: 404 });
    }

    if (existing.status === "PAID") {
      return new Response("ok", { status: 200 });
    }

    // 2) Marquer order PAID
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        status: "PAID",
        paid_at: new Date().toISOString(),
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent?.toString() || null,
      })
      .eq("id", orderId);

    if (updErr) {
      console.error("Order update error:", updErr.message);
      return new Response("Order update failed", { status: 500 });
    }

    // 3) Créer ticket + increment sold via RPC atomique
    const { data: ticketId, error: rpcErr } = await supabaseAdmin.rpc("claim_primary_ticket", {
      p_order_id: orderId,
      p_buyer_id: buyerId,
      p_batch_id: batchId,
      p_attendee_name: attendeeName,
    });

    if (rpcErr) {
      console.error("claim_primary_ticket failed:", rpcErr.message);
      return new Response("Ticket claim failed", { status: 500 });
    }

    console.log("ticket created:", ticketId);

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("webhook handler error:", e?.message || e);
    return new Response("Webhook handler failed", { status: 500 });
  }
}