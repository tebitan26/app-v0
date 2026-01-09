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
    console.error("staff_remove_profile_lookup_failed", profileError);
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
  const staffUserId =
    typeof body?.staff_user_id === "string" ? body.staff_user_id.trim() : "";

  if (!staffUserId) {
    return NextResponse.json(
      { code: "not_found", error: "not_found" },
      { status: 400 }
    );
  }

  const { data: deletedRows, error: deleteError } = await supabaseAdmin
    .from("organizer_staff")
    .delete()
    .eq("organizer_id", userId)
    .eq("staff_user_id", staffUserId)
    .select("staff_user_id");

  if (deleteError) {
    console.error("staff_remove_delete_failed", deleteError);
    return NextResponse.json(
      { code: "internal_error", error: "internal_error" },
      { status: 500 }
    );
  }

  if (!deletedRows || deletedRows.length === 0) {
    return NextResponse.json(
      { code: "not_found", error: "not_found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
