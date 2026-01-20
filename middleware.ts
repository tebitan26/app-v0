import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isPrivatePath(pathname: string) {
  return (
    pathname === "/me" ||
    pathname.startsWith("/me/") ||
    pathname === "/org" ||
    pathname.startsWith("/org/") ||
    pathname === "/staff" ||
    pathname.startsWith("/staff/") ||
    pathname === "/organisateur" ||
    pathname.startsWith("/organisateur/")
  );
}

function applyNoStoreHeaders(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate"
  );
  response.headers.set("CDN-Cache-Control", "private, no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll(cookies) {
          cookies.forEach((cookie) => {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          });
        },
      },
    }
  );

  try {
    await supabase.auth.getUser();
  } catch (err) {
    console.error("supabase_middleware_refresh_failed", err);
  }

  if (isPrivatePath(request.nextUrl.pathname)) {
    applyNoStoreHeaders(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
