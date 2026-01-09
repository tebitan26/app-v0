export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const DEFAULT_UNLOCK_HOURS = 2;

function getBearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token || null;
}

export async function POST(req: Request) {
  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
      { status: 401 }
    );
  }

  const { data: u, error: uErr } = await supabaseAdmin.auth.getUser(jwt);
  if (uErr || !u?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
      { status: 401 }
    );
  }

  const userId = u.user.id;
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_token" },
      { status: 400 }
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role, organizer_id")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.error("profile_lookup_failed", profileError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }

  const role = (profile?.role ?? "").toString().toUpperCase();
  const staffOrganizerId = (profile as any)?.organizer_id ?? null;

  if (role !== "STAFF" && role !== "ORGANIZER" && role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 }
    );
  }

  // If a STAFF has no organizer_id mapping, they cannot validate anything.
  if (role === "STAFF" && !staffOrganizerId) {
    return NextResponse.json(
      { ok: false, error: "staff_missing_organizer" },
      { status: 403 }
    );
  }

  const { data: tokenRows, error: tokenError } = await supabaseAdmin
    .from("ticket_tokens")
    .select("token,ticket_id,expires_at")
    .eq("token", token)
    .limit(1);

  if (tokenError) {
    console.error("ticket_tokens_lookup_failed", tokenError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }

  const tokenRow = tokenRows?.[0];
  if (!tokenRow) {
    return NextResponse.json(
      { ok: false, error: "token_not_found" },
      { status: 404 }
    );
  }

  if (tokenRow.expires_at) {
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < now.getTime()) {
      return NextResponse.json(
        { ok: false, error: "token_expired" },
        { status: 410 }
      );
    }
  }

  const { data: ticketRows, error: ticketError } = await supabaseAdmin
    .from("tickets")
    .select(
      "id,owner_id,status,used_at,event_id,batch_id,events(title,start_at,city,venue_name,ticket_unlock_hours,organizer_id),ticket_batches(name)"
    )
    .eq("id", tokenRow.ticket_id)
    .limit(1);

  if (ticketError) {
    console.error("ticket_lookup_failed", ticketError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }

  const ticketRow = ticketRows?.[0];
  if (!ticketRow) {
    return NextResponse.json(
      { ok: false, error: "ticket_not_found" },
      { status: 404 }
    );
  }

  const eventRow = Array.isArray(ticketRow.events)
    ? ticketRow.events[0]
    : ticketRow.events;
  const batchRow = Array.isArray(ticketRow.ticket_batches)
    ? ticketRow.ticket_batches[0]
    : ticketRow.ticket_batches;

  // P0 security: staff can validate ONLY events of their organizer.
  // Organizers can validate ONLY their own events.
  const eventOrganizerId = (eventRow as any)?.organizer_id ?? null;
  if (!eventOrganizerId) {
    return NextResponse.json(
      { ok: false, error: "event_missing_organizer" },
      { status: 500 }
    );
  }

  if (role !== "ADMIN") {
    if (role === "ORGANIZER" && eventOrganizerId !== userId) {
      return NextResponse.json(
        { ok: false, error: "forbidden_event" },
        { status: 403 }
      );
    }
    if (role === "STAFF" && eventOrganizerId !== staffOrganizerId) {
      return NextResponse.json(
        { ok: false, error: "forbidden_event" },
        { status: 403 }
      );
    }
  }

  if (ticketRow.used_at) {
    return NextResponse.json(
      { ok: false, error: "already_used", used_at: ticketRow.used_at },
      { status: 409 }
    );
  }

  if (eventRow?.start_at) {
    const unlockHours =
      eventRow.ticket_unlock_hours ?? DEFAULT_UNLOCK_HOURS;
    const unlockAtMs =
      new Date(eventRow.start_at).getTime() - unlockHours * 60 * 60 * 1000;
    if (Number.isFinite(unlockAtMs) && now.getTime() < unlockAtMs) {
      const unlockAtIso = new Date(unlockAtMs).toISOString();
      return NextResponse.json(
        {
          ok: false,
          error: "ticket_locked",
          unlock_at: unlockAtIso,
          unlock_at_ts: unlockAtMs,
        },
        { status: 423 }
      );
    }
  }

  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from("tickets")
    .update({ used_at: nowIso, status: "USED" })
    .eq("id", ticketRow.id)
    .is("used_at", null)
    .select("id,used_at")
    .limit(1);

  if (updateError) {
    console.error("ticket_update_failed", updateError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }

  const updated = updatedRows?.[0];
  if (!updated) {
    const { data: usedRows, error: usedError } = await supabaseAdmin
      .from("tickets")
      .select("used_at")
      .eq("id", ticketRow.id)
      .limit(1);

    if (usedError) {
      console.error("ticket_used_lookup_failed", usedError);
    }

    return NextResponse.json(
      {
        ok: false,
        error: "already_used",
        used_at: usedRows?.[0]?.used_at ?? null,
      },
      { status: 409 }
    );
  }

  const { error: tokenCleanupError } = await supabaseAdmin
    .from("ticket_tokens")
    .delete()
    .eq("ticket_id", ticketRow.id);

  if (tokenCleanupError) {
    console.error("ticket_token_cleanup_failed", tokenCleanupError);
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticketRow.id,
    event: {
      title: eventRow?.title ?? null,
      start_at: eventRow?.start_at ?? null,
      city: eventRow?.city ?? null,
      venue_name: eventRow?.venue_name ?? null,
      ticket_unlock_hours: eventRow?.ticket_unlock_hours ?? null,
      organizer_id: (eventRow as any)?.organizer_id ?? null,
    },
    batch: {
      id: ticketRow.batch_id ?? null,
      name: batchRow?.name ?? null,
    },
    used_at: updated.used_at ?? nowIso,
  });
}
