export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
