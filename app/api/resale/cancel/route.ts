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
  const resaleId = typeof body?.resale_id === "string" ? body.resale_id : "";

  if (!resaleId) {
    return NextResponse.json({ error: "missing_resale_id" }, { status: 400 });
  }

  const { data: resale, error: resaleError } = await supabaseAdmin
    .from("ticket_resales")
    .select(
      "id,ticket_id,event_id,seller_id,state,buyer_id,sold_at,new_ticket_id"
    )
    .eq("id", resaleId)
    .single();

  if (resaleError) {
    console.error("resale_cancel_lookup_failed", resaleError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!resale) {
    return NextResponse.json({ error: "resale_not_found" }, { status: 404 });
  }

  if (
    resale.state !== "OPEN" ||
    resale.seller_id !== auth.user.id ||
    resale.buyer_id ||
    resale.sold_at ||
    resale.new_ticket_id
  ) {
    return NextResponse.json({ error: "not_open" }, { status: 400 });
  }

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select("id,status,owner_id,used_at")
    .eq("id", resale.ticket_id)
    .single();

  if (ticketError) {
    console.error("resale_cancel_ticket_lookup_failed", ticketError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  if (ticket.owner_id !== auth.user.id) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
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
    console.error("resale_cancel_event_lookup_failed", eventError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const eventStartAt = eventRow?.start_at ? new Date(eventRow.start_at) : null;
  const isExpired = eventStartAt
    ? eventStartAt.getTime() < Date.now()
    : false;

  const { error: resaleUpdateError } = await supabaseAdmin
    .from("ticket_resales")
    .update({ state: "CANCELLED" })
    .eq("id", resale.id)
    .eq("state", "OPEN");

  if (resaleUpdateError) {
    console.error("resale_cancel_update_failed", resaleUpdateError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!isExpired) {
  if (!ticket.used_at) {
    const { error: ticketUpdateError } = await supabaseAdmin
      .from("tickets")
      .update({ status: "VALID" })
      .eq("id", ticket.id)
      .eq("status", "EN_REVENTE");

    if (ticketUpdateError) {
      console.error("resale_cancel_ticket_update_failed", ticketUpdateError);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }
  }

  const { error: logError } = await supabaseAdmin.from("logs_resale").insert({
    ticket_id_old: resale.ticket_id,
    event_id: resale.event_id,
    seller_id: auth.user.id,
    action: "CANCEL",
    reason: null,
  });

  if (logError) {
    console.error("logs_resale_cancel_insert_failed", logError);
  }

  if (isExpired) {
    return NextResponse.json({
      ok: true,
      code: "event_expired_cancelled",
    });
  }

  return NextResponse.json({ ok: true });
}
