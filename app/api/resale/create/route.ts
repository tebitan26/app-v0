export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireUser } from "@/app/org/staff/_utils";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const ticketId = typeof body?.ticket_id === "string" ? body.ticket_id : "";
  const priceCentsInput =
    typeof body?.price_cents === "number" ? body.price_cents : null;

  if (!ticketId) {
    return NextResponse.json({ error: "missing_ticket_id" }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select(
      "id,status,used_at,owner_id,event_id,batch_id,events(start_at),ticket_batches(price_cents,currency)"
    )
    .eq("id", ticketId)
    .single();

  if (ticketError) {
    console.error("resale_create_ticket_lookup_failed", ticketError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  if (ticket.owner_id !== auth.user.id) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }

  if (ticket.used_at || String(ticket.status || "").toUpperCase() !== "VALID") {
    return NextResponse.json({ error: "not_resellable" }, { status: 400 });
  }

  const eventRow = Array.isArray(ticket.events)
    ? ticket.events[0]
    : ticket.events;
  const eventStartAt = eventRow?.start_at ? new Date(eventRow.start_at) : null;
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

  const batchRow = Array.isArray(ticket.ticket_batches)
    ? ticket.ticket_batches[0]
    : ticket.ticket_batches;
  const priceCents =
    priceCentsInput && priceCentsInput > 0
      ? priceCentsInput
      : batchRow?.price_cents ?? null;
  const currency = String(batchRow?.currency ?? "EUR").toUpperCase();

  if (!priceCents) {
    return NextResponse.json({ error: "missing_price" }, { status: 400 });
  }

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from("tickets")
    .update({ status: "EN_REVENTE" })
    .eq("id", ticket.id)
    .eq("status", "VALID")
    .select("id")
    .limit(1);

  if (updateError) {
    console.error("resale_create_ticket_update_failed", updateError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!updatedRows?.[0]) {
    return NextResponse.json({ error: "not_resellable" }, { status: 409 });
  }

  const { data: resale, error: resaleError } = await supabaseAdmin
    .from("ticket_resales")
    .insert({
      ticket_id: ticket.id,
      event_id: ticket.event_id,
      seller_id: auth.user.id,
      price_cents: priceCents,
      currency,
      state: "OPEN",
    })
    .select("id")
    .single();

  if (resaleError || !resale) {
    console.error("resale_create_insert_failed", resaleError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { error: logError } = await supabaseAdmin.from("logs_resale").insert({
    ticket_id_old: ticket.id,
    event_id: ticket.event_id,
    seller_id: auth.user.id,
    action: "CREATE",
    reason: null,
  });

  if (logError) {
    console.error("logs_resale_create_insert_failed", logError);
  }

  return NextResponse.json({ ok: true, resale_id: resale.id });
}
