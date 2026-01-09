export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireOrganizerOrAdmin, requireUser } from "@/app/org/staff/_utils";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    const code = "not_authenticated";
    return NextResponse.json(
      { ok: false, code, message: "Not authenticated.", error: code },
      { status: 401 }
    );
  }

  const userId = auth.user.id;
  const perm = await requireOrganizerOrAdmin(userId);
  if ("error" in perm) {
    const code = "forbidden";
    const status = 403;
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status }
    );
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const justification =
    typeof body?.justification === "string" ? body.justification.trim() : "";

  if (!token) {
    const code = "missing_token";
    return NextResponse.json(
      { ok: false, code, message: "Missing token.", error: code },
      { status: 400 }
    );
  }

  const { data: tokenRows, error: tokenError } = await supabaseAdmin
    .from("ticket_tokens")
    .select("ticket_id,expires_at")
    .eq("token", token)
    .limit(1);

  if (tokenError) {
    console.error("ticket_tokens_lookup_failed", tokenError);
    const code = "internal_error";
    return NextResponse.json(
      { ok: false, code, message: "Internal error.", error: code },
      { status: 500 }
    );
  }

  const tokenRow = tokenRows?.[0];
  if (!tokenRow) {
    const code = "token_not_found";
    return NextResponse.json(
      { ok: false, code, message: "Token not found.", error: code },
      { status: 404 }
    );
  }

  if (tokenRow.expires_at) {
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      const code = "token_expired";
      return NextResponse.json(
        { ok: false, code, message: "Token expired.", error: code },
        { status: 401 }
      );
    }
  }

  const ticketId = tokenRow.ticket_id ?? null;
  if (!ticketId) {
    const code = "ticket_not_found";
    return NextResponse.json(
      { ok: false, code, message: "Ticket not found.", error: code },
      { status: 404 }
    );
  }

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select("id,event_id,status,used_at,owner_id,events(organizer_id)")
    .eq("id", ticketId)
    .single();

  if (ticketError) {
    console.error("ticket_lookup_failed", ticketError);
    const code = "internal_error";
    return NextResponse.json(
      { ok: false, code, message: "Internal error.", error: code },
      { status: 500 }
    );
  }

  if (!ticket) {
    const code = "ticket_not_found";
    return NextResponse.json(
      { ok: false, code, message: "Ticket not found.", error: code },
      { status: 404 }
    );
  }

  const eventRow = Array.isArray(ticket.events)
    ? ticket.events[0]
    : ticket.events;
  const eventOrganizerIdRaw = (eventRow as unknown as { organizer_id?: string })
    ?.organizer_id;
  const eventOrganizerId = eventOrganizerIdRaw
    ? String(eventOrganizerIdRaw)
    : null;

  if (!eventOrganizerId) {
    const code = "event_missing_organizer";
    return NextResponse.json(
      { ok: false, code, message: "Event missing organizer.", error: code },
      { status: 500 }
    );
  }

  if (perm.role !== "ADMIN" && eventOrganizerId !== userId) {
    const code = "forbidden_event";
    return NextResponse.json(
      { ok: false, code, message: "Forbidden event.", error: code },
      { status: 403 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from("tickets")
    .update({ status: "USED", used_at: nowIso })
    .eq("id", ticket.id)
    .select("id,event_id")
    .limit(1);

  if (updateError) {
    console.error("ticket_update_failed", updateError);
    const code = "internal_error";
    return NextResponse.json(
      { ok: false, code, message: "Internal error.", error: code },
      { status: 500 }
    );
  }

  const updated = updatedRows?.[0];
  if (!updated) {
    const code = "ticket_update_failed";
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status: 500 }
    );
  }

  const eventId = ticket.event_id ?? updated.event_id ?? null;
  if (!eventId) {
    const code = "event_missing";
    return NextResponse.json(
      { ok: false, code, message: "Event missing.", error: code },
      { status: 500 }
    );
  }

  const { error: scanLogError } = await supabaseAdmin
    .from("logs_scan")
    .insert({
      result: "OVERRIDE",
      reason: "override",
      user_id: userId,
      ticket_id: ticket.id,
      event_id: eventId,
    });

  if (scanLogError) {
    console.error("logs_scan_insert_failed", scanLogError);
    const code = "override_log_failed";
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status: 500 }
    );
  }

  const { error: overrideLogError } = await supabaseAdmin
    .from("logs_override")
    .insert({
      ticket_id: ticket.id,
      event_id: eventId,
      user_id: userId,
      justification,
    });

  if (overrideLogError) {
    console.error("logs_override_insert_failed", overrideLogError);
    const code = "override_log_failed";
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    code: "override_ok",
    ticket_id: ticket.id,
    event_id: eventId,
  });
}
