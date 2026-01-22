// app/lib/siteUrl.ts
export function getSiteUrl() {
  // ✅ In the browser, always use the current origin (localhost or vercel)
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // ✅ On the server, prefer an explicit public site URL if provided
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (publicUrl) return publicUrl;

  // ✅ Vercel provides VERCEL_URL without protocol
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  // Fallback for local SSR
  return "http://localhost:3000";
}