export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireOrganizerOrAdmin, requireUser } from "@/app/org/staff/_utils";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 }
    );
  }

  const perm = await requireOrganizerOrAdmin(auth.user.id);
  if ("error" in perm) {
    return NextResponse.json({ error: "forbidden_event" }, { status: 403 });
  }

  const url = new URL(req.url);
  const eventId = url.searchParams.get("event_id")?.trim() ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,organizer_id")
    .eq("id", eventId)
    .single();

  if (eventError) {
    console.error("logs_overrides_event_lookup_failed", eventError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!eventRow) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  if (perm.role !== "ADMIN" && eventRow.organizer_id !== auth.user.id) {
    return NextResponse.json({ error: "forbidden_event" }, { status: 403 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("logs_override")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("logs_overrides_lookup_failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ data: rows ?? [] });
}
