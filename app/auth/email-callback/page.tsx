"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

export default function EmailCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function run() {
      // Supabase lit automatiquement le #access_token
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        router.replace("/login?error=email_callback");
        return;
      }

      router.replace("/me");
    }

    run();
  }, [router]);

  return <p className="p-6">Connexion en cours…</p>;
}