"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  // Debug-only display (kept for support). Enable with ?debug=1 or NEXT_PUBLIC_SHOW_STRIPE_SESSION=true
  const showStripeSession =
    searchParams.get("debug") === "1" ||
    process.env.NEXT_PUBLIC_SHOW_STRIPE_SESSION === "true";

  return (
    <section className="mx-auto max-w-3xl space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur">
        {/* subtle glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#7A3CFF]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <span className="text-xl">✅</span>
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-semibold tracking-tight">Achat confirmé</h1>
            <p className="mt-2 text-white/70">
              Ton billet va apparaître dans <span className="text-white/90">Mes billets</span> d’ici quelques instants.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                Paiement sécurisé
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                Billet authentique
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                Revente officielle possible
              </span>
            </div>

            {showStripeSession && sessionId ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-widest text-white/40">Session Stripe</p>
                <p className="mt-1 break-all font-mono text-xs text-white/60">{sessionId}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/me/tickets"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7A3CFF] px-6 py-4 font-medium shadow-[0_8px_30px_rgba(122,60,255,0.25)] hover:opacity-95 sm:w-auto"
        >
          <span>Voir mes billets</span>
          <span aria-hidden>→</span>
        </Link>

        <Link
          href="/events"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 font-medium text-white/90 hover:bg-white/10 sm:w-auto"
        >
          <span aria-hidden>←</span>
          <span>Retour aux événements</span>
        </Link>
      </div>

      <p className="text-xs text-white/40">
        Si ton billet n’apparaît pas après 30 secondes, rafraîchis la page « Mes billets ». En cas de souci, vérifie aussi ton email de confirmation.
      </p>
    </section>
  );
}
