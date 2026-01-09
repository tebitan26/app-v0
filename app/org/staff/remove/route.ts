import { NextResponse } from "next/server";
import {
  requireOrganizerOrAdmin,
  requireUser,
  supabaseAdminClient,
} from "../_utils";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const perm = await requireOrganizerOrAdmin(auth.user.id);
  if ("error" in perm) {
    return NextResponse.json({ error: perm.error }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const staffUserId = String(body?.staff_user_id || "").trim();
  if (!staffUserId) {
    return NextResponse.json(
      { error: "missing_staff_user_id" },
      { status: 400 }
    );
  }

  const admin = supabaseAdminClient();

  // Return deleted row(s) so we can detect "not found" cleanly.
  const { data, error } = await admin
    .from("organizer_staff")
    .delete()
    .eq("organizer_id", auth.user.id)
    .eq("staff_user_id", staffUserId)
    .select("staff_user_id");

  if (error) {
    return NextResponse.json(
      { error: "internal_error", message: error.message },
      { status: 500 }
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}