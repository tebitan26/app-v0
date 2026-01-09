// app/api/org/staff/_utils.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function supabaseAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function requireUser(req: Request) {
  const token = getBearer(req);
  if (!token) return { error: "not_authenticated" as const };

  const supa = supabaseAuthClient();
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data.user) return { error: "not_authenticated" as const };

  return { user: data.user, token };
}

export async function requireOrganizerOrAdmin(userId: string) {
  const admin = supabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role,email,display_name")
    .eq("id", userId)
    .single();

  if (error || !data) return { error: "profile_not_found" as const };

  const role = String(data.role || "").toUpperCase();
  const allowed = role === "ORGANIZER" || role === "ADMIN";
  if (!allowed) return { error: "forbidden" as const };

  return { profile: data, role };
}

export async function requireStaffOrOrganizerAdmin(userId: string) {
  const admin = supabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role,organizer_id,email,display_name")
    .eq("id", userId)
    .single();

  if (error || !data) return { error: "profile_not_found" as const };

  const role = String(data.role || "").toUpperCase();
  const allowed = role === "STAFF" || role === "ORGANIZER" || role === "ADMIN";
  if (!allowed) return { error: "forbidden" as const };

  const staffOrganizerId = (data as any)?.organizer_id ?? null;
  if (role === "STAFF" && !staffOrganizerId) {
    return { error: "staff_missing_organizer" as const };
  }

  return { profile: data, role, staffOrganizerId };
}
