"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      if (typeof window === "undefined") return;

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      // Gestion des erreurs OAuth
      if (error || errorDescription) {
        router.replace("/login?error=oauth");
        return;
      }

      // Si pas de code, rediriger vers login
      if (!code) {
        router.replace("/login?error=missing_code");
        return;
      }

      // Échanger le code contre une session
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        router.replace("/login?error=oauth");
        return;
      }

      // Succès : rediriger vers /events
      router.replace("/events");
    }

    run();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-white/80">Connexion…</p>
    </div>
  );
}
