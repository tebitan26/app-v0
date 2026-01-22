"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { getSiteUrl } from "../lib/siteUrl";

type LoginError = "missing_code" | "oauth" | null;

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  // Deep-link support: after login, bring the user back to where they came from.
  // Example: /login?next=/events/<id>&intent=buy
  const rawNextParam = searchParams.get("next") || "/events";
  const intentParam = searchParams.get("intent");
  const batchIdParam = searchParams.get("batchId");

  // Security: prevent open-redirects. We only accept internal paths.
  const nextPath = useMemo(() => {
    if (!rawNextParam) return "/events";
    // Accept only internal paths ("/...") and reject protocol/host inputs.
    if (rawNextParam.startsWith("/") && !rawNextParam.startsWith("//")) {
      return rawNextParam;
    }
    return "/events";
  }, [rawNextParam]);

  const buildPostLoginRedirect = useCallback((): string => {
    // `nextPath` is expected to be an internal path like "/events/xyz".
    const base = getSiteUrl();
    const u = new URL(nextPath, base);

    // We use these flags so destination pages can refresh state / auto-run actions.
    u.searchParams.set("fromAuth", "1");
    if (intentParam === "buy") u.searchParams.set("autoBuy", "1");
    if (batchIdParam) u.searchParams.set("batchId", batchIdParam);

    return `${u.pathname}${u.search}`;
  }, [nextPath, intentParam, batchIdParam]);

  const buildCallbackUrl = useCallback((): string => {
    const cb = new URL("/auth/callback", getSiteUrl());
    // Preserve deep-link info through the OAuth/magic-link callback
    cb.searchParams.set("next", nextPath);
    if (intentParam) cb.searchParams.set("intent", intentParam);
    if (batchIdParam) cb.searchParams.set("batchId", batchIdParam);
    return cb.toString();
  }, [nextPath, intentParam, batchIdParam]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace(buildPostLoginRedirect());
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace(buildPostLoginRedirect());
        // No need for router.refresh() here; destination pages handle fromAuth/autoBuy.
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, buildPostLoginRedirect]);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const error: LoginError = errorParam === "missing_code" || errorParam === "oauth" ? errorParam : null;
    
    if (error === "missing_code" || error === "oauth") {
      setStatus("error");
      setMessage(
        "La connexion a échoué. Réessaie de te connecter ou contacte le support."
      );
    }
  }, [searchParams]);

  async function loginWithGoogle() {
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");

    const redirectTo = buildCallbackUrl();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setStatus("error");
        setMessage(error.message);
      }
    } catch {
      setStatus("error");
      setMessage("Erreur réseau, réessaie.");
    } finally {
      setStatus((prev) => (prev === "loading" ? "idle" : prev));
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        router.replace(buildPostLoginRedirect());
        setStatus("idle");
        return;
      }

      const emailRedirectTo = buildCallbackUrl();

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("sent");
      setMessage(
        "Lien envoyé ! Clique dans l'email pour te connecter (ou créer ton compte)."
      );
    } catch {
      setStatus("error");
      setMessage("Erreur réseau, réessaie.");
    } finally {
      setStatus((prev) => (prev === "loading" ? "idle" : prev));
    }
  }

  return (
    <section className="max-w-md">
      <h1 className="text-3xl font-bold">Connexion</h1>
      <p className="mt-3 text-white/80">
        Entre ton email : si tu as déjà un compte, tu te connectes. Sinon, on crée ton compte automatiquement.
        {intentParam === "buy" ? (
          <span className="block mt-2 text-white/70">
            Une fois connecté, on te ramène automatiquement pour finaliser ton achat.
          </span>
        ) : null}
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
          <label htmlFor="email" className="text-sm text-white/70">Email</label>
          <input
            id="email"
            name="email"
            value={email}
            onChange={(e) => {
              if (status === "error") {
                setStatus("idle");
                setMessage("");
              }
              setEmail(e.target.value);
            }}
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
