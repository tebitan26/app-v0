import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const response = NextResponse.json({ authenticated: false });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: userData, error } = await supabase.auth.getUser();

  if (error || !userData.user) {
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  // Fetch role from profiles table if it exists
  let role: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile) {
    role = profile.role;
  }

  response.headers.set("Cache-Control", "no-store");
  return NextResponse.json({
    authenticated: true,
    userId: userData.user.id,
    email: userData.user.email,
    role: role,
  });
}
