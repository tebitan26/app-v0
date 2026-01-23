import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = profile?.role ?? null;

  // debug minimal hors prod (optionnel)
  const debug =
    process.env.NODE_ENV !== "production" && profileErr
      ? { profileError: profileErr.message }
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