"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        // Handle both Supabase auth callback styles:
        // - PKCE/code flow:   /auth/callback?code=...
        // - Implicit/hash:    /auth/callback#access_token=...
        const hasCode = typeof window !== "undefined" && window.location.search.includes("code=");
        const hasHashToken =
          typeof window !== "undefined" &&
          (window.location.hash.includes("access_token=") || window.location.hash.includes("refresh_token="));

        // Prefer code flow if present
        if (hasCode && typeof (supabase.auth as any).exchangeCodeForSession === "function") {
          await (supabase.auth as any).exchangeCodeForSession(window.location.search);
        } else if (hasHashToken && typeof (supabase.auth as any).getSessionFromUrl === "function") {
          // Implicit flow: consume the hash and store the session
          await (supabase.auth as any).getSessionFromUrl({ storeSession: true });
        }

        // Security/cleanliness: remove tokens from the URL hash once consumed
        if (typeof window !== "undefined" && window.location.hash) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) router.replace("/events");
        else router.replace("/login");
      } catch (e) {
        console.error("auth_callback_failed", e);
        router.replace("/login?error=callback");
      }
    };

    run();
  }, [router]);

  return (
    <section>
      <h1 className="text-2xl font-bold">Connexion…</h1>
      <p className="mt-3 text-white/70">On finalise la session, une seconde.</p>
    </section>
  );
}