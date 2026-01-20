"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("On finalise la session, une seconde.");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // PKCE: ?code=...
        const code = new URLSearchParams(window.location.search).get("code");

        // Implicit: #access_token=...&refresh_token=...
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
        } else if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setErr) throw setErr;
        } else {
          // Rien à échanger: on laisse Supabase utiliser cookies/session existants
        }

        // Nettoyer l’URL (supprime le hash) avant redirection
        window.history.replaceState(null, "", "/auth/callback");

        if (!cancelled) router.replace("/me");
      } catch (e) {
        console.error("auth_callback_error", e);
        if (!cancelled) {
          setError("Impossible de finaliser la connexion. Réessaie.");
          setMsg("Erreur de connexion.");
        }
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
      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Retour login
          </button>
        </div>
      ) : null}
    </section>
  );
}