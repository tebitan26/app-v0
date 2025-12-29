"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase gère l’échange de token automatiquement via l’URL.
    // On vérifie juste si on a une session, puis on redirige.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/events");
      else router.replace("/login");
    });
  }, [router]);

  return (
    <section>
      <h1 className="text-2xl font-bold">Connexion…</h1>
      <p className="mt-3 text-white/70">On finalise la session, une seconde.</p>
    </section>
  );
}