"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/events");
    });
  }, [router]);

  async function loginWithGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      router.replace("/events");
      return;
    }

    setStatus("loading");
    setMessage("");

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Lien envoyé ! Clique dans l’email pour te connecter (ou créer ton compte).");
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-bold">Connexion</h1>
      <p className="mt-3 text-white/80">
        Entre ton email : si tu as déjà un compte, tu te connectes. Sinon, on crée ton compte automatiquement.
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={loginWithGoogle}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
        >
          Continuer avec Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/50">ou</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      </div>

      <form onSubmit={sendMagicLink} className="mt-8 space-y-4">
        <div>
          <label className="text-sm text-white/70">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="ton@email.com"
            className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none focus:border-[#7A3CFF]/60"
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90 disabled:opacity-60"
        >
          {status === "loading" ? "Envoi..." : "Recevoir mon lien"}
        </button>

        {message ? (
          <p
            className={
              status === "error" ? "text-sm text-red-300" : "text-sm text-white/80"
            }
          >
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}