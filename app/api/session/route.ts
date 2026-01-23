import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  // Buffer cookies that Supabase may want to set (refresh tokens, etc.)
  const cookiesToSet: Array<{ name: string; value: string; options: any }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookies) {
          cookies.forEach((c) => cookiesToSet.push(c));
        },
      },
    }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userData.user) {
    const res = NextResponse.json({ authenticated: false });
    res.headers.set("Cache-Control", "no-store");
    cookiesToSet.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options)
    );
    return res;
  }

  // ✅ Fetch role with service role (server-only, bypass RLS)
  let role: string | null = null;
  let profileError: string | null = null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceKey) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (pErr) profileError = pErr.message;
    if (!pErr && profile) role = profile.role ?? null;
  } else {
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (pErr) profileError = pErr.message;
    if (!pErr && profile) role = profile.role ?? null;
  }

  // debug minimal hors prod (optionnel)
  const debug =
    process.env.NODE_ENV !== "production" && profileError
      ? { profileError }
      : {};

  const res = NextResponse.json({
    authenticated: true,
    userId: userData.user.id,
    email: userData.user.email,
    role,
    ...debug,
  });

  res.headers.set("Cache-Control", "no-store");
  cookiesToSet.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, options)
  );

  return res;
}