import { NextResponse } from "next/server";
import { requireOrganizerOrAdmin, requireUser, supabaseAdminClient } from "../_utils";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const perm = await requireOrganizerOrAdmin(auth.user.id);
  if ("error" in perm) return NextResponse.json({ error: perm.error }, { status: 403 });

  const admin = supabaseAdminClient();
  const { data, error } = await admin
    .from("organizer_staff_view")
    .select("*")
    .eq("organizer_id", auth.user.id)
    .order("created_at", { ascending: false });

if (error) {
  return NextResponse.json(
    { error: "internal_error", message: error.message },
    { status: 500 }
  );
}
return NextResponse.json({ data: data ?? [] });
}
