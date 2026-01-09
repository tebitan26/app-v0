export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
  requireStaffOrOrganizerAdmin,
  requireUser,
} from "@/app/org/staff/_utils";

type ScanResult = "OK" | "REFUSED";

type ScanLogInput = {
  result: ScanResult;
  reason: string | null;
  userId?: string | null;
  ticketId?: string | null;
  eventId?: string | null;
};

async function logScanAttempt({
  result,
  reason,
  userId,
  ticketId,
  eventId,
}: ScanLogInput) {
  const payload: Record<string, string | null> = { result, reason };
  if (userId) payload.user_id = userId;
  if (ticketId) payload.ticket_id = String(ticketId);
  if (eventId) payload.event_id = String(eventId);

  const { error } = await supabaseAdmin.from("logs_scan").insert(payload);
  if (error) {
    console.error("logs_scan_insert_failed", error);
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    const code = "not_authenticated";
    await logScanAttempt({ result: "REFUSED", reason: code ?? null });
    return NextResponse.json(
      { ok: false, code, message: "Not authenticated.", error: code },
      { status: 401 }
    );
  }

  const userId = auth.user.id;
  const perm = await requireStaffOrOrganizerAdmin(userId);
  if ("error" in perm) {
    const code = perm.error;
    const status = code === "profile_not_found" ? 404 : 403;
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId });
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status }
    );
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    const code = "missing_token";
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId });
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
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId });
    return NextResponse.json(
      { ok: false, code, message: "Internal error.", error: code },
      { status: 500 }
    );
  }

  const tokenRow = tokenRows?.[0];
  if (!tokenRow) {
    const code = "token_not_found";
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId });
    return NextResponse.json(
      { ok: false, code, message: "Token not found.", error: code },
      { status: 404 }
    );
  }

  if (tokenRow.expires_at) {
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      const code = "token_expired";
      await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId });
      return NextResponse.json(
        { ok: false, code, message: "Token expired.", error: code },
        { status: 401 }
      );
    }
  }

  const ticketId = tokenRow.ticket_id ?? null;
  if (!ticketId) {
    const code = "ticket_not_found";
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId });
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
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId, ticketId });
    return NextResponse.json(
      { ok: false, code, message: "Internal error.", error: code },
      { status: 500 }
    );
  }

  if (!ticket) {
    const code = "ticket_not_found";
    await logScanAttempt({ result: "REFUSED", reason: code ?? null, userId, ticketId });
    return NextResponse.json(
      { ok: false, code, message: "Ticket not found.", error: code },
      { status: 404 }
    );
  }

  const eventRow = Array.isArray(ticket.events)
    ? ticket.events[0]
    : ticket.events;
  const eventOrganizerIdRaw = (eventRow as any)?.organizer_id ?? null;
  const eventOrganizerId = eventOrganizerIdRaw
    ? String(eventOrganizerIdRaw)
    : null;

  if (!eventOrganizerId) {
    const code = "event_missing_organizer";
    await logScanAttempt({
      result: "REFUSED",
      reason: code ?? null,
      userId,
      ticketId: ticket.id,
      eventId: ticket.event_id ?? null,
    });
    return NextResponse.json(
      { ok: false, code, message: "Event missing organizer.", error: code },
      { status: 500 }
    );
  }

  const staffOrganizerId = perm.staffOrganizerId
    ? String(perm.staffOrganizerId)
    : null;

  if (perm.role !== "ADMIN") {
    if (perm.role === "ORGANIZER" && eventOrganizerId !== userId) {
      const code = "forbidden_event";
      await logScanAttempt({
        result: "REFUSED",
        reason: code ?? null,
        userId,
        ticketId: ticket.id,
        eventId: ticket.event_id ?? null,
      });
      return NextResponse.json(
        { ok: false, code, message: "Forbidden event.", error: code },
        { status: 403 }
      );
    }

    if (perm.role === "STAFF" && eventOrganizerId !== staffOrganizerId) {
      const code = "forbidden_event";
      await logScanAttempt({
        result: "REFUSED",
        reason: code ?? null,
        userId,
        ticketId: ticket.id,
        eventId: ticket.event_id ?? null,
      });
      return NextResponse.json(
        { ok: false, code, message: "Forbidden event.", error: code },
        { status: 403 }
      );
    }
  }

  const status = String(ticket.status || "").toUpperCase();
  if (status !== "ACTIVE") {
    const code =
      status === "USED" || ticket.used_at ? "already_used" : "not_scannable";
    await logScanAttempt({
      result: "REFUSED",
      reason: code ?? null,
      userId,
      ticketId: ticket.id,
      eventId: ticket.event_id ?? null,
    });
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from("tickets")
    .update({ status: "USED", used_at: nowIso })
    .eq("id", ticket.id)
    .eq("status", "ACTIVE")
    .select("id")
    .limit(1);

  if (updateError) {
    console.error("ticket_update_failed", updateError);
    const code = "internal_error";
    await logScanAttempt({
      result: "REFUSED",
      reason: code ?? null,
      userId,
      ticketId: ticket.id,
      eventId: ticket.event_id ?? null,
    });
    return NextResponse.json(
      { ok: false, code, message: "Internal error.", error: code },
      { status: 500 }
    );
  }

  if (!updatedRows?.[0]) {
    const code = "already_used";
    await logScanAttempt({
      result: "REFUSED",
      reason: code ?? null,
      userId,
      ticketId: ticket.id,
      eventId: ticket.event_id ?? null,
    });
    return NextResponse.json(
      { ok: false, code, message: code, error: code },
      { status: 409 }
    );
  }

  const okCode = "ok";
  await logScanAttempt({
    result: "OK",
    reason: okCode ?? null,
    userId,
    ticketId: ticket.id,
    eventId: ticket.event_id ?? null,
  });

  return NextResponse.json({
    ok: true,
    code: "ok",
    ticket_id: ticket.id,
    event_id: ticket.event_id ?? null,
  });
}
