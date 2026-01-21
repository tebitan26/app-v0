import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPrivatePath(pathname: string) {
  return (
    pathname === "/me" ||
    pathname.startsWith("/me/") ||
    pathname === "/org" ||
    pathname.startsWith("/org/") ||
    pathname === "/staff" ||
    pathname.startsWith("/staff/") ||
    pathname === "/organisateur" ||
    pathname.startsWith("/organisateur/") ||
    pathname === "/events" ||
    pathname.startsWith("/events/") ||
    pathname === "/login"
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

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/auth/callback")) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  if (isPrivatePath(pathname)) {
    applyNoStoreHeaders(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
