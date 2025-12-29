"use client";

import Link from "next/link";
import { useSessionProfile } from "../lib/useSessionProfile";

export default function StaffPage() {
  const { loading, role } = useSessionProfile();

  if (loading) return <p className="text-white/70">Chargement…</p>;

  const allowed = role === "STAFF" || role === "ADMIN";
  if (!allowed) {
    return (
      <section>
        <h1 className="text-3xl font-bold">Staff</h1>
        <p className="mt-4 text-white/80">Accès réservé au staff.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          Se connecter
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-bold">Staff</h1>
      <p className="mt-4 text-white/80">
        Ici on fera le scan QR et la validation anti-doublon (Sprint scan).
      </p>
    </section>
  );
}