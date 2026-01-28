import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/org/staff/_utils";
import { getSiteUrl } from "@/app/lib/siteUrl";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const resaleId = typeof body?.resale_id === "string" ? body.resale_id : "";

  if (!resaleId) {
    return NextResponse.json({ error: "missing_resale_id" }, { status: 400 });
  }

  const { data: resale, error: resaleError } = await supabaseAdmin
    .from("ticket_resales")
    .select("id,ticket_id,event_id,price_cents,currency,state,seller_id")
    .eq("id", resaleId)
    .single();

  if (resaleError) {
    console.error("resale_checkout_lookup_failed", resaleError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!resale) {
    return NextResponse.json({ error: "resale_not_found" }, { status: 404 });
  }

  if (resale.state !== "OPEN") {
    if (resale.state === "SOLD") {
      return NextResponse.json({ error: "resale_sold" }, { status: 409 });
    }
    return NextResponse.json({ error: "not_open" }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select("id,status,event_id,events(title)")
    .eq("id", resale.ticket_id)
    .single();

  if (ticketError) {
    console.error("resale_checkout_ticket_lookup_failed", ticketError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  if (String(ticket.status || "").toUpperCase() !== "EN_REVENTE") {
    return NextResponse.json({ error: "not_open" }, { status: 400 });
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,start_at")
    .eq("id", resale.event_id)
    .single();

  if (eventError) {
    console.error("resale_checkout_event_lookup_failed", eventError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!eventRow) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  const eventStartAt = eventRow.start_at ? new Date(eventRow.start_at) : null;
  if (!eventStartAt) {
    return NextResponse.json(
      { code: "resale_closed", error: "resale_closed" },
      { status: 409 }
    );
  }

  const nowTs = Date.now();
  if (eventStartAt.getTime() < nowTs) {
    return NextResponse.json(
      { code: "event_expired", error: "event_expired" },
      { status: 409 }
    );
  }

  const cutoffMs = eventStartAt.getTime() - 30 * 60 * 1000;
  if (nowTs >= cutoffMs) {
    return NextResponse.json(
      { code: "resale_closed", error: "resale_closed" },
      { status: 409 }
    );
  }

  const eventInfo = Array.isArray(ticket.events)
    ? ticket.events[0]
    : ticket.events;
  const eventTitle = eventInfo?.title ?? "Ticket Sidetick";

  // PoC pricing rule (current behavior): `ticket_resales.price_cents` is the FINAL price paid by the buyer.
  // The 10% fee is already included in this amount (ex: 99€ shown in marketplace => Stripe must charge 99€).
  // We derive the seller net and the fee for dashboard/reporting purposes.
  const buyerPriceCents = Number(resale.price_cents || 0);

  // PoC rule: free tickets cannot be resold
  // (avoids Stripe 0€ checkouts and keeps marketplace logic simple)
  if (!Number.isFinite(buyerPriceCents) || buyerPriceCents <= 0) {
    return NextResponse.json({ error: "free_ticket_resale_not_allowed" }, { status: 400 });
  }

  // seller net = floor(buyer / 1.10)
  const sellerPriceCents = Math.floor((buyerPriceCents * 100) / 110);
  const feeCents = buyerPriceCents - sellerPriceCents;

  if (!Number.isFinite(sellerPriceCents) || sellerPriceCents <= 0) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  const siteUrl = getSiteUrl();

  const { data: pendingRows, error: pendingError } = await supabaseAdmin
    .from("ticket_resales")
    .update({ state: "CHECKOUT_PENDING" })
    .eq("id", resale.id)
    .eq("state", "OPEN")
    .select("id")
    .limit(1);

  if (pendingError) {
    console.error("resale_checkout_pending_failed", pendingError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!pendingRows?.[0]) {
    return NextResponse.json(
      { error: "resale_not_available" },
      { status: 409 }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (resale.currency || "EUR").toLowerCase(),
          unit_amount: buyerPriceCents,
          product_data: {
            name: `Revente — ${eventTitle}`,
            // Note: the amount charged includes platform fees (+10%)
          },
        },
      },
    ],
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: resale.event_id
      ? `${siteUrl}/events/${resale.event_id}`
      : `${siteUrl}/events`,
    metadata: {
      type: "resale",
      resale_id: resale.id,
      buyer_id: auth.user.id,
      seller_id: resale.seller_id,
      event_id: resale.event_id,
      ticket_id_old: resale.ticket_id,
      seller_price_cents: String(sellerPriceCents),
      buyer_price_cents: String(buyerPriceCents),
      fee_cents: String(feeCents),
    },
  });

  const { error: updateError } = await supabaseAdmin
    .from("ticket_resales")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", resale.id);

  if (updateError) {
    console.error("resale_checkout_update_failed", updateError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: session.url });
}
