export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

function getBearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token || null;
}

export async function GET(req: Request) {
  const jwt = getBearer(req);
  if (!jwt) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
      { status: 401 }
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
    jwt
  );
  if (userError || !userData?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
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
    console.error("staff_list_profile_lookup_failed", profileError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }

  const role = (profile?.role ?? "").toString().toUpperCase();
  if (role !== "ORGANIZER" && role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("organizer_staff_view")
    .select(
      "organizer_id,staff_user_id,staff_email,staff_display_name,created_at"
    )
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false });

  if (staffError) {
    console.error("staff_list_query_failed", staffError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, staff: staff ?? [] });
}
