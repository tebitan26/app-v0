export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

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
      { code: "not_authenticated", error: "not_authenticated" },
      { status: 401 }
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
    jwt
  );
  if (userError || !userData?.user?.id) {
    return NextResponse.json(
      { code: "not_authenticated", error: "not_authenticated" },
      { status: 401 }
    );
  }

  const userId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.error("staff_add_profile_lookup_failed", profileError);
    return NextResponse.json(
      { code: "internal_error", error: "internal_error" },
      { status: 500 }
    );
  }

  const role = (profile?.role ?? "").toString().toUpperCase();
  if (role !== "ORGANIZER" && role !== "ADMIN") {
    return NextResponse.json(
      { code: "not_authorized", error: "not_authorized" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json(
      { code: "invalid_email", error: "invalid_email" },
      { status: 400 }
    );
  }

  const { data: staffProfile, error: staffError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, display_name")
    .ilike("email", email)
    .limit(1);

  if (staffError) {
    console.error("staff_add_lookup_failed", staffError);
    return NextResponse.json(
      { code: "internal_error", error: "internal_error" },
      { status: 500 }
    );
  }

  const staffRow = staffProfile?.[0];
  if (!staffRow?.id) {
    return NextResponse.json(
      { code: "user_not_found", error: "user_not_found" },
      { status: 404 }
    );
  }

  const { error: insertError } = await supabaseAdmin
    .from("organizer_staff")
    .insert({ organizer_id: userId, staff_user_id: staffRow.id });

  if (insertError) {
    const isUniqueViolation =
      (insertError as { code?: string })?.code === "23505" ||
      insertError.message?.includes("organizer_staff_unique_staff");
    if (isUniqueViolation) {
      return NextResponse.json(
        {
          error: "already_assigned",
          message: "Ce membre est déjà rattaché à un autre organisateur.",
        },
        { status: 409 }
      );
    }
    console.error("staff_add_insert_failed", insertError);
    return NextResponse.json(
      { code: "internal_error", error: "internal_error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
