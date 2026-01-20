import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  const requestCookies = await cookies();

  // Prépare la réponse de redirection vers /me, sur laquelle nous allons
  // réellement écrire les cookies de session Supabase.
  const response = NextResponse.redirect(new URL("/me", url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return requestCookies.getAll();
        },
        setAll(cookiesToSet) {
          console.log(
            "callback: setAll cookies count =",
            cookiesToSet.length
          );

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // En cas d'erreur, on redirige simplement vers /login sans persister de session.
      return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
    }

    console.log("callback: exchangeCodeForSession ok");
  }

  return response;
}