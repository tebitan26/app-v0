import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY env var");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-12-15.clover",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase admin env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_RESALE;

  if (!sig || !webhookSecret) {
    return new Response("Missing stripe-signature or webhook secret", { status: 400 });
  }

  let evt: Stripe.Event;

  try {
    const body = await req.text();
    evt = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("resale webhook signature error:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    if (evt.type !== "checkout.session.completed") {
      return new Response("ok", { status: 200 });
    }

    const session = evt.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata ?? {};
    const resaleId = metadata.resale_id;
    const buyerId = metadata.buyer_id;

    // Optional pricing metadata (added by our resale checkout route)
    const sellerPriceCentsMeta = metadata.seller_price_cents;
    const buyerPriceCentsMeta = metadata.buyer_price_cents;
    const feeCentsMeta = metadata.fee_cents;

    const parseIntOrNull = (v: unknown): number | null => {
      if (typeof v !== "string" || v.trim() === "") return null;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };

    const sellerPriceCents = parseIntOrNull(sellerPriceCentsMeta);
    const buyerPriceCents = parseIntOrNull(buyerPriceCentsMeta);
    const feeCents = parseIntOrNull(feeCentsMeta);

    if (!resaleId || !buyerId) {
      console.error("Missing resale metadata", { resaleId, buyerId });
      return new Response("Missing resale metadata", { status: 400 });
    }

    const { data: resale, error: resaleError } = await supabaseAdmin
      .from("ticket_resales")
      .select("id,ticket_id,event_id,state,seller_id,stripe_checkout_session_id,new_ticket_id")
      .eq("id", resaleId)
      .single();

    if (resaleError || !resale) {
      console.error("Resale not found", resaleError?.message);
      return new Response("Resale not found", { status: 404 });
    }

    if (resale.state === "SOLD") {
      return new Response("ok", { status: 200 });
    }

    if (resale.stripe_checkout_session_id && resale.stripe_checkout_session_id !== session.id) {
      console.error("Resale session mismatch", {
        resaleId,
        expected: resale.stripe_checkout_session_id,
        got: session.id,
      });
      return new Response("Resale session mismatch", { status: 409 });
    }

    if (resale.state !== "CHECKOUT_PENDING") {
      return new Response("Resale not pending", { status: 409 });
    }

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("tickets")
      .select("id,status,event_id,batch_id")
      .eq("id", resale.ticket_id)
      .single();

    if (ticketError || !ticket) {
      console.error("Resale ticket not found", ticketError?.message);
      return new Response("Resale ticket not found", { status: 404 });
    }

    if (String(ticket.status || "").toUpperCase() !== "EN_REVENTE") {
      return new Response("Ticket not in resale", { status: 409 });
    }

    const { error: oldTicketError } = await supabaseAdmin
      .from("tickets")
      .update({ status: "REVENDU" })
      .eq("id", ticket.id)
      .eq("status", "EN_REVENTE");

    if (oldTicketError) {
      console.error("Resale ticket update failed", oldTicketError.message);
      return new Response("Resale update failed", { status: 500 });
    }

    const { data: newTicket, error: newTicketError } = await supabaseAdmin
      .from("tickets")
      .insert({
        owner_id: buyerId,
        event_id: ticket.event_id,
        batch_id: ticket.batch_id,
        status: "VALID",
      })
      .select("id")
      .single();

    if (newTicketError || !newTicket) {
      console.error("Resale new ticket failed", newTicketError?.message);
      return new Response("Resale new ticket failed", { status: 500 });
    }

    const soldAt = new Date().toISOString();

    // Prefer metadata amounts; fallback to Stripe session amount_total for buyer paid.
    const buyerPaidCents = typeof session.amount_total === "number" ? session.amount_total : null;

    // If we have seller price and buyer paid, derive fee.
    const derivedFeeCents =
      sellerPriceCents != null && buyerPaidCents != null ? Math.max(0, buyerPaidCents - sellerPriceCents) : null;

    const updatePayload: Record<string, any> = {
      state: "SOLD",
      buyer_id: buyerId,
      new_ticket_id: newTicket.id,
      sold_at: soldAt,
    };

    // Only set these if the columns exist in DB (after migration) and we have values.
    if (buyerPriceCents != null) updatePayload.buyer_price_cents = buyerPriceCents;
    if (feeCents != null) updatePayload.fee_cents = feeCents;

    // Fallbacks from session
    if (updatePayload.buyer_price_cents == null && buyerPaidCents != null) {
      updatePayload.buyer_price_cents = buyerPaidCents;
    }
    if (updatePayload.fee_cents == null && derivedFeeCents != null) {
      updatePayload.fee_cents = derivedFeeCents;
    }

    const { error: resaleUpdateError } = await supabaseAdmin
      .from("ticket_resales")
      .update(updatePayload)
      .eq("id", resale.id)
      .eq("state", "CHECKOUT_PENDING");

    if (resaleUpdateError) {
      console.error("Resale finalize update failed", resaleUpdateError.message);
      return new Response("Resale finalize failed", { status: 500 });
    }

    const { error: resaleLogError } = await supabaseAdmin
      .from("logs_resale")
      .insert({
        ticket_id_old: ticket.id,
        ticket_id_new: newTicket.id,
        event_id: resale.event_id,
        seller_id: resale.seller_id,
        buyer_id: buyerId,
        action: "SOLD",
        reason: null,
      });

    if (resaleLogError) {
      console.error("logs_resale_sold_insert_failed", resaleLogError);
    }

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("resale webhook handler error:", e?.message || e);
    return new Response("Webhook handler failed", { status: 500 });
  }
}
