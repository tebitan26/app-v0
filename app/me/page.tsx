"use client";

import Link from "next/link";
import { useSessionProfile } from "../lib/useSessionProfile";

export default function MePage() {
  const { loading, userEmail, role } = useSessionProfile();

  if (loading) {
    return <p className="text-white/70">Chargement…</p>;
  }

  if (!userEmail) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <p className="text-white/70">Non authentifié</p>
        <Link
          href="/login"
          className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          Se connecter
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <div className="mt-4 space-y-2 text-white/70">
          <p>
            <span className="text-white/50">Email</span> · {userEmail}
          </p>
          <p>
            <span className="text-white/50">Rôle</span> · {role ?? "—"}
          </p>
        </div>
        <p className="mt-4 text-xs text-white/40">
          (Bêta) La modification du profil arrive bientôt.
        </p>
      </div>

      <Link
        href="/me/tickets"
        className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
      >
        Mes billets
      </Link>
    </section>
  );
}
