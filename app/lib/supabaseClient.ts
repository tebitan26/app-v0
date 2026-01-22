import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper pour parser document.cookie
function parseCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
  return document.cookie.split("; ").map((cookie) => {
    const [name, ...valueParts] = cookie.split("=");
    return {
      name: name.trim(),
      value: decodeURIComponent(valueParts.join("=")),
    };
  });
}

// Helper pour construire une chaîne cookie
function buildCookieString(name: string, value: string, options?: { path?: string; maxAge?: number; expires?: Date | string; sameSite?: "lax" | "strict" | "none" | boolean; secure?: boolean }): string {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options?.path) cookie += `; Path=${options.path}`;
  if (options?.maxAge !== undefined) cookie += `; Max-Age=${options.maxAge}`;
  if (options?.expires) {
    const expires = options.expires instanceof Date ? options.expires : new Date(options.expires);
    cookie += `; Expires=${expires.toUTCString()}`;
  }
  if (options?.sameSite !== undefined) {
    const sameSite = typeof options.sameSite === "boolean" 
      ? (options.sameSite ? "strict" : "lax")
      : options.sameSite;
    cookie += `; SameSite=${sameSite}`;
  }
  if (options?.secure) cookie += `; Secure`;
  return cookie;
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    getAll(): { name: string; value: string }[] {
      return parseCookies();
    },
    setAll(cookiesToSet: { name: string; value: string; options?: { path?: string; maxAge?: number; expires?: Date | string; sameSite?: "lax" | "strict" | "none" | boolean; secure?: boolean } }[]): void {
      cookiesToSet.forEach(({ name, value, options }) => {
        document.cookie = buildCookieString(name, value, options);
      });
    },
  },
});