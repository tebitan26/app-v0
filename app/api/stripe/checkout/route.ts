import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function POST(req: Request) {
  try {
    const { batchId } = await req.json();

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    if (!batchId) {
      return Response.json({ error: "Missing batchId" }, { status: 400 });
    }

    // 1) récupérer le lot + event
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("ticket_batches")
      .select(
        "id,event_id,name,price_cents,currency,quantity_total,quantity_sold,sale_start,sale_end"
      )
      .eq("id", batchId)
      .single();

    if (batchErr || !batch) {
      return Response.json({ error: batchErr?.message || "Batch not found" }, { status: 404 });
    }

    const { data: event, error: evErr } = await supabaseAdmin
      .from("events")
      .select("id,title,status,start_at,doors_at")
      .eq("id", batch.event_id)
      .single();

    if (evErr || !event) {
      return Response.json({ error: evErr?.message || "Event not found" }, { status: 404 });
    }

    if (event.status !== "PUBLISHED") {
      return Response.json({ error: "event_not_published" }, { status: 400 });
    }

    const now = new Date();
    const startAt = event.start_at ? new Date(event.start_at) : null;

    if (startAt && startAt <= now) {
      return Response.json({ error: "event_started" }, { status: 400 });
    }

    const saleStart = batch.sale_start ? new Date(batch.sale_start) : null;
    const saleEnd = batch.sale_end ? new Date(batch.sale_end) : null;

    if (saleStart && now < saleStart) {
      return Response.json({ error: "sale_not_started" }, { status: 400 });
    }

    if (saleEnd && now > saleEnd) {
      return Response.json({ error: "sale_ended" }, { status: 400 });
    }

    const remaining = batch.quantity_total - batch.quantity_sold;
    if (remaining <= 0) {
      return Response.json({ error: "sold_out" }, { status: 400 });
    }

    // 2) créer un order "PENDING" (optionnel si tu l’as déjà fait dans ta SQL)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        event_id: event.id,
        batch_id: batch.id,
        buyer_id: userId,
        status: "PENDING",
        amount_cents: batch.price_cents,
        currency: batch.currency,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return Response.json({ error: orderErr?.message || "Cannot create order" }, { status: 500 });
    }

    // 3) créer Stripe checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (batch.currency || "EUR").toLowerCase(),
            unit_amount: batch.price_cents,
            product_data: {
              name: `${event.title} — ${batch.name}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/events/${event.id}?success=1`,
      cancel_url: `${appUrl}/events/${event.id}?canceled=1`,
      metadata: {
        order_id: order.id,
        event_id: event.id,
        batch_id: batch.id,
        buyer_id: userId,
      },
    });

    return Response.json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return Response.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
