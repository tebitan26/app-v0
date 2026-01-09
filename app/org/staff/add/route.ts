import { NextResponse } from "next/server";
import { requireOrganizerOrAdmin, requireUser, supabaseAdminClient } from "../_utils";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const perm = await requireOrganizerOrAdmin(auth.user.id);
  if ("error" in perm) return NextResponse.json({ error: perm.error }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "missing_email" }, { status: 400 });

  const admin = supabaseAdminClient();

  // 1) find staff profile by email
  const { data: staff, error: staffErr } = await admin
    .from("profiles")
    .select("id,email,role,display_name")
    .eq("email", email)
    .single();

  if (staffErr || !staff) return NextResponse.json({ error: "staff_not_found" }, { status: 404 });

  const staffRole = String(staff.role || "").toUpperCase();
  if (staffRole !== "STAFF" && staffRole !== "ADMIN") {
    return NextResponse.json({ error: "not_staff_role" }, { status: 400 });
  }

  // 2) prevent self-linking (optional)
  if (staff.id === auth.user.id) {
    return NextResponse.json({ error: "cannot_add_self" }, { status: 400 });
  }

  // 3) insert relation
  const { error: insErr } = await admin.from("organizer_staff").insert({
    organizer_id: auth.user.id,
    staff_user_id: staff.id,
  });

  // if already exists, depending on constraints it might throw
  // handle as idempotent behavior:
  if (insErr) {
    if ((insErr as { code?: string })?.code === "23505") {
      return NextResponse.json(
        {
          error: "already_assigned",
          message: "Ce membre est déjà rattaché à un autre organisateur.",
        },
        { status: 409 }
      );
    }
    // common duplicate error codes vary; treat duplicate as OK if you prefer:
    if (String(insErr.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ ok: true, already: true });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
