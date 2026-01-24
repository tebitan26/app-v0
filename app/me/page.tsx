"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSessionProfile } from "../lib/useSessionProfile";

function roleLabel(role?: string | null) {
  const r = (role || "").toUpperCase();
  if (!r) return "—";
  if (r === "ORGANIZER") return "Organisateur";
  if (r === "STAFF") return "Staff";
  if (r === "FAN") return "Fan";
  return r;
}

export default function MePage() {
  const { loading, userId, userEmail, role } = useSessionProfile();

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  const bugReportUrl =
    process.env.NEXT_PUBLIC_DISCORD_BUG_REPORT_URL ?? "https://discord.com";

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyId = async () => {
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);

      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 1000);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return <p className="text-white/70">Chargement…</p>;
  }

  if (!userEmail) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <p className="text-white/70">Non authentifié</p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
          >
            Se connecter
          </Link>

          <a
            href={bugReportUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
          >
            Signaler un problème
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* Profile card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#7A3CFF]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative">
          <h1 className="text-3xl font-bold">Mon profil</h1>

          <div className="mt-4 space-y-2 text-white/70">
            <p>
              <span className="text-white/50">Email</span> · {userEmail}
            </p>

            <p>
              <span className="text-white/50">Rôle</span> · {roleLabel(role)}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0">
                <span className="text-white/50">User ID</span> ·{" "}
                <span className="break-all">{userId ?? "—"}</span>
              </p>
              {userId ? (
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                >
                  {copied ? "Copié ✅" : "Copier ID"}
                </button>
              ) : null}
            </div>
          </div>

          <p className="mt-4 text-xs text-white/40">
            (Bêta) La modification du profil arrive bientôt.
          </p>
        </div>
      </div>

      {/* Quick actions (P0 hub) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/me/tickets"
          className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white/60">Accès</p>
              <p className="mt-1 text-lg font-semibold">Mes billets</p>
              <p className="mt-1 text-sm text-white/70">
                QR anti-fraude, revente officielle, statut.
              </p>
            </div>
            <span className="text-white/60 transition group-hover:translate-x-0.5">
              →
            </span>
          </div>
        </Link>

        <Link
          href="/events"
          className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white/60">Découvrir</p>
              <p className="mt-1 text-lg font-semibold">Voir les événements</p>
              <p className="mt-1 text-sm text-white/70">
                Achat primaire, paiement Stripe.
              </p>
            </div>
            <span className="text-white/60 transition group-hover:translate-x-0.5">
              →
            </span>
          </div>
        </Link>

        <Link
          href="/marketplace"
          className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white/60">Secondaire</p>
              <p className="mt-1 text-lg font-semibold">Marketplace</p>
              <p className="mt-1 text-sm text-white/70">
                Revente officielle, prix capé + frais.
              </p>
            </div>
            <span className="text-white/60 transition group-hover:translate-x-0.5">
              →
            </span>
          </div>
        </Link>

        <a
          href={bugReportUrl}
          target="_blank"
          rel="noreferrer"
          className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-white/60">Support</p>
              <p className="mt-1 text-lg font-semibold">Signaler un problème</p>
              <p className="mt-1 text-sm text-white/70">
                Ouvre Discord avec le template bug.
              </p>
            </div>
            <span className="text-white/60 transition group-hover:translate-x-0.5">
              ↗
            </span>
          </div>
        </a>
      </div>

      {/* P0 info (no backend) */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold">Checklist rapide</h2>
        <ul className="mt-3 space-y-2 text-sm text-white/70">
          <li>• Acheter un billet sur un événement (primaire)</li>
          <li>• Retrouver le billet dans “Mes billets”</li>
          <li>• Tester la mise en revente officielle (si éligible)</li>
          <li>• Vérifier la visibilité du QR (T-2h)</li>
        </ul>
        <p className="mt-3 text-xs text-white/40">
          Objectif P0 : démonstration fluide + anti-fraude + revente officielle.
        </p>
      </div>
    </section>
  );
}