export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { requireOrganizerOrAdmin, requireUser } from "@/app/org/staff/_utils";

type ExportType = "scans" | "overrides";

function safeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

function formatFilename(type: ExportType, eventId: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `sidetick-${type}-${eventId}-${stamp}.csv`;
}

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
  const type = (url.searchParams.get("type")?.trim() ?? "") as ExportType;

  if (!eventId) {
    return NextResponse.json({ error: "missing_event_id" }, { status: 400 });
  }

  if (type !== "scans" && type !== "overrides") {
    return NextResponse.json({ error: "internal_error" }, { status: 400 });
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,organizer_id")
    .eq("id", eventId)
    .single();

  if (eventError) {
    console.error("logs_export_event_lookup_failed", eventError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!eventRow) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  if (perm.role !== "ADMIN" && eventRow.organizer_id !== auth.user.id) {
    return NextResponse.json({ error: "forbidden_event" }, { status: 403 });
  }

  let rows: Record<string, unknown>[] = [];
  if (type === "scans") {
    const { data, error } = await supabaseAdmin
      .from("logs_scan")
      .select("created_at,ticket_id,event_id,user_id,result,reason")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("logs_export_scans_failed", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    rows = data ?? [];
  } else {
    const { data, error } = await supabaseAdmin
      .from("logs_override")
      .select("created_at,ticket_id,event_id,user_id,justification")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("logs_export_overrides_failed", error);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    rows = data ?? [];
  }

  const lines: string[] = [];
  if (type === "scans") {
    lines.push("timestamp,ticket_id,event_id,user_id,result,reason");
    rows.forEach((row) => {
      lines.push(
        [
          safeCsv(row.created_at),
          safeCsv(row.ticket_id),
          safeCsv(row.event_id),
          safeCsv(row.user_id),
          safeCsv(row.result),
          safeCsv(row.reason),
        ].join(",")
      );
    });
  } else {
    lines.push("timestamp,ticket_id,event_id,user_id,justification");
    rows.forEach((row) => {
      lines.push(
        [
          safeCsv(row.created_at),
          safeCsv(row.ticket_id),
          safeCsv(row.event_id),
          safeCsv(row.user_id),
          safeCsv(row.justification),
        ].join(",")
      );
    });
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${formatFilename(
        type,
        eventId
      )}\"`,
    },
  });
}
