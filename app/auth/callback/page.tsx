"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("On finalise la session, une seconde.");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1) Si on est en flow PKCE, Supabase doit échanger ?code=...
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("exchangeCodeForSession error", error);
            if (!cancelled) setMsg("Erreur session (exchange). Retour login…");
            router.replace("/login");
            return;
          }

          // Nettoie l’URL (évite de garder le code)
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.toString());
        } else {
          // 2) Pas de `code` dans l’URL :
          // - soit la session est déjà stockée (refresh token / cookie),
          // - soit l’utilisateur est arrivé ici manuellement.
          // On ne fait rien et on vérifie la session juste après.
        }

        // 3) Vérifie la session
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace("/events");
        } else {
          router.replace("/login");
        }
      } catch (e) {
        console.error("callback error", e);
        router.replace("/login");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <section>
      <h1 className="text-2xl font-bold">Connexion…</h1>
      <p className="mt-3 text-white/70">{msg}</p>
    </section>
  );
}