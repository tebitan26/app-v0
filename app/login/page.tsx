"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
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
    setMessage("Magic link envoyé ! Vérifie ta boîte mail (et les spams).");
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-bold">Connexion</h1>
      <p className="mt-3 text-white/80">
        On t’envoie un lien de connexion par email (magic link).
      </p>

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